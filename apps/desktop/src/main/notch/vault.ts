import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  fchmodSync,
} from 'node:fs';
import { join } from 'node:path';
import type { AssistantLibraryView } from '../../shared/assistant-library.js';
import { notchVaultRoot } from './foreground.js';

export interface VaultNote {
  name: string;
  text: string;
  revision: string;
  readOnly: boolean;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sensitive =
  /(?:-----BEGIN|\b(?:password|api[_ -]?key|access[_ -]?token|secret)\s*[:=]|\bsk-[a-z0-9]{12})/i;
const safeText = (text: string) =>
  sensitive.test(text) ? '[sensitive content omitted]' : text;
const validName =
  /^(?:[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(?:md|log)|skills\/[a-z0-9][a-z0-9-]{0,79}\.sh)$/;

/** File/host adapter. Journal selection and recording execute the copied Swift
 * JournalStore, SkillLibrary and AgentResponse, not a second JS implementation. */
export class NotchVault {
  readonly root: string;
  constructor(
    readonly workspace: string,
    readonly agentId: string,
  ) {
    if (!/^[a-zA-Z0-9-]+$/.test(agentId)) throw new Error('Invalid native agent identifier.');
    this.root = notchVaultRoot(workspace, agentId);
  }
  ensure(): string {
    mkdirSync(this.workspace, { recursive: true, mode: 0o700 });
    for (const path of [
      join(this.workspace, '.sia-mac'),
      this.root,
      join(this.root, 'skills'),
    ]) {
      if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('The memory vault must be a real directory.');
    }
    return realpathSync(this.root);
  }
  #path(name: string): string {
    if (!validName.test(name))
      throw new Error('Choose a note or skill inside this agent’s vault.');
    return join(this.ensure(), name);
  }
  read(name: string): VaultNote {
    const path = this.#path(name);
    let fd: number | undefined;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || info.size > 8_000_000)
        throw new Error('The vault file must be an ordinary UTF-8 file under 8 MB.');
      const text = readFileSync(fd, 'utf8');
      return { name, text, revision: digest(text), readOnly: name === 'preferences.md' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { name, text: '', revision: '', readOnly: name === 'preferences.md' };
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  list(): VaultNote[] {
    if (!existsSync(this.root)) return [];
    this.ensure();
    return [
      ...readdirSync(this.root).filter((name) => validName.test(name)),
      ...readdirSync(join(this.root, 'skills'))
        .map((name) => 'skills/' + name)
        .filter((name) => validName.test(name)),
    ]
      .sort()
      .slice(0, 200)
      .flatMap((name) => {
        try {
          const note = this.read(name);
          return [
            {
              ...note,
              text: note.text.slice(-60000),
              readOnly: note.readOnly || note.text.length > 60000,
            },
          ];
        } catch {
          return [];
        }
      });
  }
  write(name: string, text: string, revision: string, managed = false): VaultNote {
    if (name === 'preferences.md' && !managed)
      throw new Error('Edit saved preferences in Sia’s Memory settings.');
    if (sensitive.test(text))
      throw new Error('Credentials cannot be stored in the memory vault.');
    if (
      Buffer.byteLength(text) >
      (name.startsWith('skills/') ? 16_000 : managed ? 8_000_000 : 256_000)
    )
      throw new Error('This vault file is too large.');
    const path = this.#path(name);
    let fd: number | undefined;
    try {
      fd = openSync(
        path,
        constants.O_RDWR |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK |
          (revision ? 0 : constants.O_CREAT | constants.O_EXCL),
        name.endsWith('.sh') ? 0o700 : 0o600,
      );
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || info.size > 8_000_000)
        throw new Error('The vault file must be an ordinary bounded file.');
      if (revision && digest(readFileSync(fd, 'utf8')) !== revision)
        throw new Error('This file changed. Read its current revision before saving.');
      ftruncateSync(fd, 0);
      // Reading moved the descriptor offset; explicit-position writes preserve the whole file.
      const bytes = Buffer.from(text);
      let written = 0;
      while (written < bytes.length)
        written += writeSync(fd, bytes, written, bytes.length - written, written);
      fchmodSync(fd, name.endsWith('.sh') ? 0o700 : 0o600);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    return this.read(name);
  }
  readSlice(name: string, offset?: number) {
    const note = this.read(name);
    const start =
      offset ??
      (['journal.md', 'failures.log'].includes(name)
        ? Math.max(0, note.text.length - 60000)
        : 0);
    const end = Math.min(note.text.length, start + 60000);
    return {
      ...note,
      text: note.text.slice(start, end),
      offset: start,
      totalCharacters: note.text.length,
      truncated: start > 0 || end < note.text.length,
      nextOffset: end < note.text.length ? end : null,
    };
  }
  append(name: string, text: string, revision: string): VaultNote {
    if (!['journal.md', 'failures.log', 'lessons.md'].includes(name))
      throw new Error('Append is available only for journal, failures and lessons.');
    const before = this.read(name);
    if (before.revision !== revision)
      throw new Error('This file changed. Read its current revision before appending.');
    return this.write(name, before.text + text, revision, true);
  }
  initialize(view: AssistantLibraryView): void {
    this.ensure();
    const preferences = view.memories
      .filter((entry) => entry.agentId === this.agentId && entry.enabled)
      .map((entry) => `## ${entry.title}\n${safeText(entry.text)}`)
      .join('\n\n');
    const text =
      '# Saved Sia preferences\n\nManaged by Sia’s Memory settings.\n\n' + preferences + '\n';
    const current = this.read('preferences.md');
    if (current.text !== text) this.write('preferences.md', text, current.revision, true);
    const marker = join(this.root, '.sia-imported');
    if (!existsSync(marker)) {
      // One-way migration; encrypted conversation/history remains intact. Never
      // inspect ~/.notch or copy its configuration, keys, or personal memories.
      if (view.learningAgents?.includes(this.agentId) && !this.read('journal.md').revision) {
        const entries = (view.journal ?? []).filter(
          (entry) => entry.agentId === this.agentId && entry.kind === 'task',
        );
        if (entries.length)
          this.write(
            'journal.md',
            '# Sia journal\n\n' +
              entries
                .map(
                  (entry) =>
                    `- [${entry.timestamp}] ${safeText(entry.title + ' → ' + entry.text).replaceAll('\n', ' ')}`,
                )
                .join('\n') +
              '\n',
            '',
            true,
          );
        const failures = entries.filter((entry) =>
          ['failed', 'blocked'].includes(entry.outcome ?? ''),
        );
        if (failures.length && !this.read('failures.log').revision)
          this.write(
            'failures.log',
            failures
              .map(
                (entry) =>
                  `- [${entry.timestamp}] ${safeText(entry.title + ' FAILED: ' + entry.text).replaceAll('\n', ' ')}`,
              )
              .join('\n'),
            '',
            true,
          );
      }
      const legacy = join(this.workspace, '.sia-mac', 'skills');
      if (existsSync(legacy) && !lstatSync(legacy).isSymbolicLink()) {
        for (const name of readdirSync(legacy)
          .filter((name) => validName.test('skills/' + name))
          .slice(0, 100)) {
          const path = join(legacy, name),
            info = lstatSync(path);
          if (
            !info.isFile() ||
            info.isSymbolicLink() ||
            info.nlink !== 1 ||
            info.size > 16_000 ||
            this.read('skills/' + name).revision
          )
            continue;
          const source = readFileSync(path, 'utf8');
          if (!sensitive.test(source)) this.write('skills/' + name, source, '');
        }
      }
      writeFileSync(marker, '1\n', { flag: 'wx', mode: 0o600 });
    }
    const index = this.read('MOC.md');
    if (!index.text.includes('[[preferences]]'))
      this.write(
        'MOC.md',
        (index.text ||
          '# Sia — Map of Content\n\n- [[journal]] — chronological activity log\n- [[lessons]] — distilled lessons\n') +
          '\n- [[preferences]] — saved Sia preferences\n',
        index.revision,
      );
  }
  clearJournal(): void {
    for (const name of ['journal.md', 'failures.log']) {
      const entry = this.read(name);
      if (entry.revision) this.write(name, '', entry.revision);
    }
  }
  remove(name: string, revision: string): void {
    if (['MOC.md', 'journal.md', 'failures.log', 'lessons.md', 'preferences.md'].includes(name))
      throw new Error('Edit or clear this core vault file instead of deleting it.');
    const entry = this.read(name);
    if (!entry.revision || entry.revision !== revision)
      throw new Error('This file changed. Refresh before deleting.');
    unlinkSync(this.#path(name));
  }
  requested(): boolean {
    return existsSync(join(this.root, '.consolidate-now'));
  }
  due(now = Date.now()): boolean {
    const modified = (name: string) => {
      try {
        return statSync(join(this.root, name)).mtimeMs;
      } catch {
        return 0;
      }
    };
    const last = modified('.last-consolidation');
    return (
      this.requested() ||
      (now - last > 6 * 3600_000 &&
        Math.max(modified('journal.md'), modified('failures.log')) > last)
    );
  }
  markConsolidation(): void {
    this.ensure();
    for (const name of ['.consolidate-now', '.last-consolidation']) {
      const path = join(this.root, name);
      if (existsSync(path)) unlinkSync(path);
    }
    writeFileSync(join(this.root, '.last-consolidation'), '', { flag: 'wx', mode: 0o600 });
  }
  async engine(
    helper: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ prompt?: string; recorded?: boolean }> {
    const root = this.ensure();
    if (input.operation === 'record') {
      input = {
        ...input,
        request: safeText(String(input.request ?? '')),
        response: safeText(String(input.response ?? '')),
      };
    }
    return await new Promise((resolve, reject) => {
      const child = execFile(
        helper,
        ['--notch-engine'],
        { timeout: 10_000, maxBuffer: 2_000_000, ...(signal ? { signal } : {}) },
        (error, stdout) => {
          if (error)
            return reject(
              new Error('Sia’s native memory engine could not complete the request.'),
            );
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Invalid native memory engine response.'));
          }
        },
      );
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(JSON.stringify({ ...input, root }));
    });
  }
}
