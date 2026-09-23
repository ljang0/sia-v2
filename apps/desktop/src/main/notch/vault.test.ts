import { randomUUID, createHash } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  symlinkSync,
  linkSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { AssistantLibraryView } from '../../shared/assistant-library.js';
import { NotchVault } from './vault.js';
import { NativeSkills } from '../native-skills.js';
import { notchForegroundInstructions, notchConsolidationInstructions } from './foreground.js';

const roots: string[] = [];
// native:test builds this helper before the workspace test suite.
const helper = resolve(import.meta.dirname, '../../../build/native/SiaVoiceHelper');
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'sia-notch-vault-'));
  roots.push(workspace);
  const agentId = randomUUID(),
    vault = new NotchVault(workspace, agentId);
  const view: AssistantLibraryView = {
    memories: [
      { id: randomUUID(), agentId, title: 'Report label', text: 'JUNIPER', enabled: true },
    ],
    workflows: [],
    context: false,
    learningAgents: [agentId],
    nativeLearningAgents: [agentId],
    journal: [
      {
        id: randomUUID(),
        agentId,
        threadId: randomUUID(),
        turnId: randomUUID(),
        timestamp: new Date().toISOString(),
        kind: 'task',
        title: 'Legacy request',
        text: 'Verified legacy result',
        outcome: 'complete',
      },
    ],
  };
  return { workspace, agentId, vault, view };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('migrates only this agent’s history and legacy scripts once, and keeps preference deletion authoritative', () => {
  const { workspace, agentId, vault, view } = fixture();
  mkdirSync(join(workspace, '.sia-mac', 'skills'), { recursive: true });
  writeFileSync(
    join(workspace, '.sia-mac', 'skills', 'sum.sh'),
    '#!/bin/bash\n# skill: sum\n# description: Sum numbers\nprintf 34\n',
  );
  const original = structuredClone(view);
  vault.initialize(view);
  expect(view).toEqual(original);
  expect(vault.read('journal.md').text).toContain('Verified legacy result');
  expect(new NativeSkills(workspace, agentId).list()[0]?.title).toBe('sum');
  const note = vault.write('course.md', '# Course\n[[preferences]]\nKeep this note.', '');
  const restarted = new NotchVault(workspace, agentId);
  restarted.initialize({ ...view, memories: [] });
  expect(restarted.read('preferences.md').text).not.toContain('JUNIPER');
  expect(restarted.read('course.md')).toEqual(note);
  expect(restarted.read('journal.md').text.match(/Verified legacy result/g)).toHaveLength(1);
  const other = new NotchVault(workspace, randomUUID());
  other.initialize(view);
  expect(other.read('preferences.md').text).not.toContain('JUNIPER');
  expect(other.read('course.md').revision).toBe('');
});

it('refuses traversal, links, stale revisions and accidental skill execution', () => {
  const { workspace, vault, view } = fixture();
  vault.initialize(view);
  const outside = join(workspace, 'keep.txt');
  writeFileSync(outside, 'keep');
  for (const name of ['../keep.txt', '/etc/passwd', 'skills/../../keep.md'])
    expect(() => vault.read(name)).toThrow();
  symlinkSync(outside, join(vault.root, 'linked.md'));
  linkSync(outside, join(vault.root, 'hardlinked.md'));
  for (const name of ['linked.md', 'hardlinked.md']) expect(() => vault.read(name)).toThrow();
  const first = vault.write('lesson.md', 'first', '');
  const second = vault.write('lesson.md', 'second shorter', first.revision);
  expect(() => vault.write('lesson.md', 'overwrite', first.revision)).toThrow('changed');
  expect(vault.read('lesson.md')).toEqual(second);
  expect(() =>
    vault.write('preferences.md', 'overwrite', vault.read('preferences.md').revision),
  ).toThrow('preferences');
  const marker = join(workspace, 'must-not-execute');
  const skill = vault.write('skills/test.sh', `#!/bin/bash\ntouch '${marker}'\n`, '');
  expect(statSync(join(vault.root, skill.name)).mode & 0o777).toBe(0o700);
  expect(existsSync(marker)).toBe(false);
  expect(readFileSync(outside, 'utf8')).toBe('keep');
});

it.runIf(process.platform === 'darwin')(
  'executes the copied Swift journal, full MOC, lesson tail and skill registry across requests',
  async () => {
    const { workspace, agentId, vault, view } = fixture();
    vault.initialize(view);
    const index = vault.read('MOC.md');
    vault.write(
      'MOC.md',
      index.text + '\n' + Array.from({ length: 55 }, (_, i) => `- [[topic-${i}]]`).join('\n'),
      index.revision,
    );
    vault.write(
      'lessons.md',
      '# Lessons\nIgnored prose\n- [[calendar]]: Expand all accounts.\n',
      '',
    );
    new NativeSkills(workspace, agentId).save({
      title: 'Sum',
      description: 'Sum integers',
      source: 'printf 34\n',
    });
    const prepare = () =>
      vault.engine(helper, {
        operation: 'prepare',
        request: 'Read this course',
        context: 'Safari / Canvas',
        learning: true,
        nativeLearning: true,
      });
    const first = (await prepare()).prompt!;
    expect(first).toContain('Safari / Canvas');
    expect(first).toContain('[[topic-54]]');
    expect(first).toContain('Expand all accounts.');
    expect(first).not.toContain('Ignored prose');
    expect(first).toContain('Sum integers');
    expect(first.indexOf('<recent_activity')).toBeLessThan(first.indexOf('<lessons'));
    expect(first).toContain('USER REQUEST (spoken): Read this course');
    await vault.engine(helper, {
      operation: 'record',
      request: 'Sum numbers',
      learning: true,
      outcome: 'complete',
      response: JSON.stringify({
        type: 'action',
        response: 'Verified count 4 and sum 34.',
        success: true,
        learned_skill: 'sum',
        steps: ['Read output'],
      }),
    });
    expect((await prepare()).prompt).toContain('Verified count 4 and sum 34.');
    await vault.engine(helper, {
      operation: 'record',
      request: 'Missing file',
      learning: true,
      outcome: 'failed',
      response: JSON.stringify({
        type: 'clarify',
        response: 'Observed missing input.txt',
        success: false,
        steps: ['Read input'],
      }),
    });
    expect(vault.read('failures.log').text).toContain('Observed missing input.txt');
    const before = vault.read('journal.md').revision;
    await vault.engine(helper, {
      operation: 'record',
      request: 'Paused',
      learning: false,
      response: '{}',
      outcome: 'complete',
    });
    expect(vault.read('journal.md').revision).toBe(before);
  },
  20000,
);

it('keeps the upstream sources pinned and uses screenshot verification and the actual consolidation recipe', () => {
  const root = resolve(import.meta.dirname, '../../../native/notch');
  const manifest = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
  for (const [path, hash] of Object.entries(manifest.files))
    expect(
      createHash('sha256')
        .update(readFileSync(join(root, 'upstream', path.split('/').at(-1)!)))
        .digest('hex'),
    ).toBe(hash);
  const prompt = notchForegroundInstructions('/fixture/vault');
  expect(prompt).toContain('after EVERY state-changing step');
  expect(prompt).toContain('/fixture/vault/MOC.md');
  expect(prompt).not.toMatch(/~\/\.notch|screencapture|Bash call's|BACKGROUND CODING WORKERS/);
  expect(prompt).toContain('verify its saved contents by reading it back');
  expect(prompt).not.toContain('open it with `open <file>`');
  expect(prompt).not.toContain('Narrate each exec_command');
  const review = notchConsolidationInstructions('/fixture/vault');
  for (const instruction of [
    'PROMOTE',
    'DISTILL',
    'INDEX',
    '40',
    'Clear failures.log',
    'memory_vault',
  ])
    expect(review).toContain(instruction);
});
