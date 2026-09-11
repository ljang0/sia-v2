import { randomUUID } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { NativeSkills } from './native-skills.js';

const directories: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'sia-native-skills-'));
  directories.push(root);
  return { root, agentId: randomUUID() };
};
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it('discovers Notch-format scripts afresh across restarts and edits without executing them', () => {
  const { root, agentId } = fixture();
  const registry = new NativeSkills(root, agentId);
  const marker = join(root, 'never-executed');
  const saved = registry.save({
    title: 'Inspect Finder',
    description: 'Inspect a Finder window.',
    source: `touch '${marker}'\n`,
  });
  expect(statSync(saved.path!).mode & 0o777).toBe(0o700);
  expect(saved.source).toContain('# skill: inspect-finder');
  expect(registry.prompt()).toContain('inspect-finder');
  const restarted = new NativeSkills(root, agentId);
  expect(restarted.list()).toEqual([saved]);
  writeFileSync(
    saved.path!,
    '#!/bin/bash\n# skill: Finder status\n# description: Read the visible folder.\nprintf done\n',
  );
  expect(restarted.list()[0]).toMatchObject({ id: saved.id, title: 'Finder status' });
  expect(restarted.list()[0]?.revision).not.toBe(saved.revision);
  expect(restarted.prompt()).toContain('Read the visible folder');
  expect(existsSync(marker)).toBe(false);
  restarted.remove(saved.id);
  expect(restarted.prompt()).toContain('NO saved native skills');
});

it('skips links and oversized scripts, refuses replacement paths and never overwrites another skill', () => {
  const { root, agentId } = fixture();
  const registry = new NativeSkills(root, agentId);
  const saved = registry.save({
    title: 'Existing',
    description: 'Keep me',
    source: 'printf original',
  });
  expect(() =>
    registry.save({ title: 'Existing', description: 'Replace', source: 'printf wrong' }),
  ).toThrow();
  expect(readFileSync(saved.path!, 'utf8')).toContain('original');
  const outside = join(root, 'private.txt');
  writeFileSync(outside, 'unrelated');
  symlinkSync(outside, join(registry.directory, 'linked.sh'));
  linkSync(outside, join(registry.directory, 'hardlinked.sh'));
  writeFileSync(join(registry.directory, 'large.sh'), 'x'.repeat(16001));
  expect(registry.list()).toEqual([saved]);
  expect(() =>
    registry.save({ id: randomUUID(), title: 'Other agent', description: 'x', source: 'x' }),
  ).toThrow('deleted');
  const second = fixture();
  mkdirSync(join(second.root, '.sia-mac'));
  symlinkSync(root, join(second.root, '.sia-mac', 'skills'));
  expect(() => new NativeSkills(second.root, second.agentId).list()).toThrow('real directory');
  expect(readFileSync(outside, 'utf8')).toBe('unrelated');
});
