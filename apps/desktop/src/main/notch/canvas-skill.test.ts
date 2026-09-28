import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = resolve(import.meta.dirname, '../../../native/notch/skills/canvas-api.sh');
const roots: string[] = [];

function run(args: string[], body = '[{"id":42}]') {
  const root = mkdtempSync(join(tmpdir(), 'sia-canvas-skill-'));
  roots.push(root);
  const mock = join(root, 'osascript');
  const call = join(root, 'call');
  writeFileSync(
    mock,
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$MOCK_CALL"\nprintf "%s\\n" "$MOCK_BODY"\n',
  );
  chmodSync(mock, 0o700);
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOCK_CALL: call,
      MOCK_BODY: body,
      PATH: `${root}:${process.env.PATH}`,
    },
  });
  return { result, call };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('uses only the active-course and one-course assignment reads through Safari', () => {
  const courses = run(['courses']);
  expect(courses.result.status).toBe(0);
  expect(JSON.parse(courses.result.stdout)).toEqual([{ id: 42 }]);
  expect(readFileSync(courses.call, 'utf8')).toContain(
    '/api/v1/courses?enrollment_state=active&include[]=teachers&include[]=term&per_page=100&page=1',
  );

  const assignments = run(['assignments', '12345', '2']);
  expect(assignments.result.status).toBe(0);
  expect(readFileSync(assignments.call, 'utf8')).toContain(
    '/api/v1/courses/12345/assignments?per_page=100&page=2',
  );
});

it('rejects arbitrary endpoints and script injection before Safari is contacted', () => {
  for (const args of [
    ['/api/v1/users/self'],
    ['courses', '1;open'],
    ['assignments', "1');alert(1)//"],
    ['assignments', '123', '../users'],
  ]) {
    const { result, call } = run(args);
    expect(result.status).toBe(2);
    expect(() => readFileSync(call)).toThrow();
  }
});

it('refuses a non-list response instead of treating an auth page as Canvas data', () => {
  const { result } = run(['courses'], '<html>Sign in</html>');
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Canvas did not return a course or assignment list.');
});
