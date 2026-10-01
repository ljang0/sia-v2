import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionExecutionResult } from '@sia/action-gateway';

/** Notch's reusable Bash skills, with host operations brokered instead of bypassPermissions. */
export async function runExecutableSkill(options: {
  source: string;
  input: Record<string, string>;
  signal?: AbortSignal;
  invoke(name: string, args: unknown, signal: AbortSignal): Promise<ActionExecutionResult>;
  timeoutMs?: number;
  idleTimeoutMs?: number;
}): Promise<ActionExecutionResult> {
  if (process.platform !== 'darwin') throw new Error('Executable skills require macOS.');
  if (options.signal?.aborted) throw new Error('Skill cancelled.');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sia-skill-')));
  const sourcePath = join(directory, 'skill.sh');
  const quote = (value: string) => JSON.stringify(value);
  // Kernel sandbox, inherited by every descendant. No access to the user's home,
  // provider state, network, Apple events, or GUI. Only the parent owns capabilities.
  const profile = `(version 1)
(deny default)
(allow process-exec process-fork)
(allow sysctl-read)
(allow file-read* (literal "/"))
(allow file-read-metadata (path-ancestors ${quote(directory)}))
(allow file-read* (subpath "/bin") (subpath "/usr/bin") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/System/Library"))
(deny file-read* (subpath "/System/Library/Keychains"))
(allow file-read* file-write* (subpath ${quote(directory)}))
(allow file-read* file-write* (literal "/dev/null") (literal "/dev/urandom"))`;
  const wrapper = `#!/bin/bash
set -euo pipefail
ulimit -t 15
ulimit -f 512
IFS= read -r SIA_INPUT
sia_action() {
  printf 'SIA_ACTION\\t%s\\t%s\\n' "$1" "$2"
  IFS= read -r SIA_RESULT || exit 70
}
sia_json_get() {
  /usr/bin/plutil -extract "$1" raw -o - -
}
sia_json_object() {
  if (( $# % 2 != 0 )); then return 64; fi
  local document key value
  document=$(/usr/bin/mktemp "$TMPDIR/json.XXXXXX")
  /usr/bin/plutil -create xml1 "$document"
  while (( $# )); do
    key="$1"; value="$2"; shift 2
    if [[ ! "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then return 64; fi
    /usr/bin/plutil -insert "$key" -string "$value" "$document" || return
  done
  /usr/bin/plutil -convert json -o - "$document"
  /bin/rm "$document"
}
${options.source}
`;
  try {
    await writeFile(sourcePath, wrapper, { mode: 0o600 });
    return await new Promise<ActionExecutionResult>((resolve, reject) => {
      const child = spawn(
        '/usr/bin/sandbox-exec',
        ['-p', profile, '/bin/bash', '--noprofile', '--norc', sourcePath],
        {
          cwd: directory,
          detached: true,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: directory,
            TMPDIR: directory,
            LANG: 'en_US.UTF-8',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let buffer = '';
      let output = '';
      let bytes = 0;
      let calls = 0;
      let pending = false;
      let lastProgress = Date.now();
      let unverifiedAction = false;
      let lastObservation: unknown;
      let failure: string | undefined;
      const actionAbort = new AbortController();
      const kill = () => {
        actionAbort.abort();
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* Already exited. */
          }
        }
      };
      const stop = (message: string) => {
        failure ??= message;
        kill();
      };
      const abort = () => stop('Skill cancelled; completed actions are preserved.');
      const timer = setTimeout(
        () => stop('Skill timed out; inspect completed actions before another run.'),
        options.timeoutMs ?? 180_000,
      );
      timer.unref();
      const idleLimit = options.idleTimeoutMs ?? 30_000;
      const idleTimer = setInterval(
        () => {
          if (!pending && Date.now() - lastProgress >= idleLimit)
            stop(
              'Skill stopped making progress between host actions. Check for a command waiting on stdin: read SIA_INPUT or SIA_RESULT explicitly. Inspect completed actions before retrying.',
            );
        },
        Math.min(idleLimit, 1000),
      );
      idleTimer.unref();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      child.stdin.on('error', () => undefined);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      const count = (text: string) => {
        lastProgress = Date.now();
        bytes += Buffer.byteLength(text);
        if (bytes > 64 * 1024) {
          stop('Skill output exceeded 64 KB.');
          return false;
        }
        return true;
      };
      child.stderr.on('data', (text: string) => {
        if (count(text)) output += text;
      });
      child.stdout.on('data', (text: string) => {
        if (!count(text) || failure) return;
        buffer += text;
        while (buffer.includes('\n')) {
          const end = buffer.indexOf('\n');
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line.startsWith('SIA_ACTION\t')) {
            output += line + '\n';
            continue;
          }
          if (pending || ++calls > 32) {
            stop('Skills must request one action at a time, at most 32 per run.');
            return;
          }
          const match = /^SIA_ACTION\t([a-z][a-z0-9_]*)\t(.+)$/.exec(line);
          if (!match || /^(skill_|memory_|assistant_)/.test(match[1]!)) {
            stop('Invalid or recursive skill action.');
            return;
          }
          let args: unknown;
          try {
            args = JSON.parse(match[2]!);
          } catch {
            stop('Skill action arguments must be JSON.');
            return;
          }
          pending = true;
          // The original turn's signal also cancels pending gateway approvals. A skill
          // timeout is propagated by the host callback through the combined signal.
          void Promise.resolve()
            .then(() => options.invoke(match[1]!, args, actionAbort.signal))
            .then((result) => {
              pending = false;
              lastProgress = Date.now();
              if (failure || actionAbort.signal.aborted) return;
              const state =
                result.data && typeof result.data === 'object'
                  ? (result.data as Record<string, unknown>)
                  : undefined;
              const observedDelivery =
                match[1] === 'computer_action' &&
                result.outcome === 'accepted_unverified' &&
                typeof state?.snapshot_id === 'string' &&
                !state.observation_pending &&
                !state.loading;
              if (result.outcome !== 'verified' && !observedDelivery) {
                stop(
                  `Skill stopped after ${result.outcome}: ${result.summary}. Inspect the current state before retrying.`,
                );
                return;
              }
              const payload = JSON.stringify({ ...result, images: undefined });
              if (payload.length > 128 * 1024) {
                stop('Skill action result was too large.');
                return;
              }
              if (observedDelivery) {
                // A fresh snapshot lets the script inspect the next state; delivery
                // still cannot become semantic success merely because Bash exits 0.
                unverifiedAction = true;
              }
              if (unverifiedAction && typeof state?.snapshot_id === 'string')
                lastObservation = state;
              child.stdin.write(payload + '\n');
            })
            .catch(() =>
              stop('Skill action failed; inspect completed actions before retrying.'),
            );
        }
      });
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(idleTimer);
        options.signal?.removeEventListener('abort', abort);
        kill();
      };
      child.once('error', () => {
        cleanup();
        reject(new Error('Could not start the macOS skill sandbox.'));
      });
      child.once('close', (code) => {
        if (pending && !failure) failure = 'Skill exited before its pending action completed.';
        cleanup();
        resolve({
          outcome:
            failure || code !== 0
              ? 'refused'
              : unverifiedAction
                ? 'accepted_unverified'
                : 'verified',
          summary:
            failure ??
            (code === 0
              ? unverifiedAction
                ? 'Skill finished after UI input. Inspect the returned observation or capture fresh state to verify the requested outcome before reporting success.'
                : 'Skill finished. Review the returned output and action evidence.'
              : 'Skill failed inside its sandbox.'),
          data: {
            exitCode: code,
            output: (output + buffer).slice(0, 16000),
            actionCount: calls,
            ...(lastObservation ? { last_observation: lastObservation } : {}),
          },
        });
      });
      child.stdin.write(JSON.stringify(options.input) + '\n');
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
