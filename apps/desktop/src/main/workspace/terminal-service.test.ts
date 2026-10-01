import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkspaceOperationError } from './operation-guards.js';
import {
  DirectUserBackgroundTerminalService,
  DirectUserTerminalService,
} from './terminal-service.js';
import { removeTemporaryRoots, temporaryRoots } from './test-support.js';

afterEach(removeTemporaryRoots);

describe('DirectUserTerminalService', () => {
  it('binds a single command to the validated workspace and captures both streams', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserTerminalService({
      environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
      maxTimeoutMs: 1_000,
      maxOutputBytes: 4_096,
    });
    const command = await terminal.scope(root);
    const resolvedRoot = await realpath(root);

    const result = await command.execute("printf 'standard'; printf 'problem' >&2; /bin/pwd");

    expect(result).toMatchObject({
      workspace: resolvedRoot,
      exitCode: 0,
      timedOut: false,
      aborted: false,
      outputLimitExceeded: false,
      stderr: 'problem',
    });
    expect(result.stdout).toBe(`standard${resolvedRoot}\n`);
    await expect(command.execute('true')).rejects.toBeInstanceOf(WorkspaceOperationError);
  });

  it('bounds output and terminates the one-shot process when the limit is reached', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-output-'));
    temporaryRoots.push(root);
    const command = await new DirectUserTerminalService({
      maxTimeoutMs: 1_000,
      maxOutputBytes: 128,
    }).scope(root);

    const result = await command.execute("while true; do printf '0123456789'; done");

    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBeLessThanOrEqual(128);
    expect(result.outputLimitExceeded).toBe(true);
    expect(result.signal).toBe('SIGKILL');
  });

  it('supports timeout and abort without allowing a caller-selected cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-bounds-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserTerminalService({ maxTimeoutMs: 500 });
    const timeoutCommand = await terminal.scope(root);
    const timeout = await timeoutCommand.execute('sleep 2', { timeoutMs: 20 });
    expect(timeout).toMatchObject({ timedOut: true, aborted: false, signal: 'SIGKILL' });

    const abort = new AbortController();
    const abortedCommand = await terminal.scope(root);
    const running = abortedCommand.execute('sleep 2', { signal: abort.signal });
    setTimeout(() => abort.abort(), 20);
    const aborted = await running;
    expect(aborted).toMatchObject({ timedOut: false, aborted: true, signal: 'SIGKILL' });
  });
});

describe('DirectUserBackgroundTerminalService', () => {
  it('keeps a workspace-scoped process running, accepts input, and stops its process group', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-background-terminal-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserBackgroundTerminalService({
      environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
      maxOutputBytes: 4_096,
    });

    expect(terminal.busy).toBe(false);
    const started = await terminal.start(
      root,
      'read line; printf \'received:%s\' "$line"; sleep 5',
    );
    expect(started).toMatchObject({ cwd: await realpath(root), status: 'running' });
    expect(terminal.busy).toBe(true);
    await terminal.write(root, started.id, 'hello\n');

    let session = started;
    for (
      let attempt = 0;
      attempt < 30 && !session.output.includes('received:hello');
      attempt += 1
    ) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      session = (await terminal.list(root))[0]!;
    }
    expect(session.output).toContain('received:hello');
    expect(await terminal.stop(root, started.id)).toMatchObject({ status: 'stopped' });
    expect(terminal.busy).toBe(false);
    terminal.dispose();
  });
});
