import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { gradeReliabilityCase } from './reliability/grade.js';
import type { ReliabilityCase } from './reliability/types.js';

it('keeps exactly 100 distinct tasks with valid sources across ten domains', async () => {
  const cases = JSON.parse(
    await readFile(
      new URL('../../../tests/fixtures/reliability/cases.json', import.meta.url),
      'utf8',
    ),
  ) as ReliabilityCase[];
  expect(cases).toHaveLength(100);
  expect(new Set(cases.map((item) => item.id)).size).toBe(100);
  expect(new Set(cases.map((item) => item.request)).size).toBe(100);
  const categories = new Set(cases.map((item) => item.category));
  expect(categories.size).toBe(10);
  for (const category of categories)
    expect(cases.filter((item) => item.category === category)).toHaveLength(10);
  for (const item of cases) {
    expect(item.app.pages[item.app.start], item.id).toBeDefined();
    for (const path of item.mustObserve) expect(item.app.pages[path], item.id).toBeDefined();
    for (const page of Object.values(item.app.pages)) {
      for (const path of Object.values(page.links ?? {}))
        expect(item.app.pages[path], item.id).toBeDefined();
      for (const button of Object.values(page.buttons ?? {}))
        if (button.goto) expect(item.app.pages[button.goto], item.id).toBeDefined();
    }
    expect(Object.keys(item.expected).length).toBeGreaterThan(0);
  }
});

const scenario: ReliabilityCase = {
  id: 'oracle-check',
  category: 'test',
  title: 'Independent oracle',
  request: 'Save the correct note.',
  app: { start: '/', pages: { '/': { title: 'Note', text: 'Correct value is 42.' } } },
  fields: 'value: number',
  expected: { value: 42 },
  mustObserve: ['/'],
  writes: [{ id: 'note', values: { Body: '42' } }],
  files: { 'source.txt': '42' },
  expectedFiles: { 'note.txt': '42' },
};
const observation = () => ({
  scenario,
  report: { value: 42 },
  state: {
    pid: 123,
    current: '/',
    visits: ['/'],
    writes: [{ id: 'note', values: { Body: '42' } }],
  },
  observed: new Set(['/']),
  forbidden: [] as string[],
  status: 'idle',
  originalFiles: { 'source.txt': '42' },
  finalFiles: { 'source.txt': '42', 'note.txt': '42' },
});

it('does not accept a success label or plausible report instead of actual state', () => {
  expect(() => gradeReliabilityCase(observation())).not.toThrow();
  expect(() => gradeReliabilityCase({ ...observation(), report: { value: 41 } })).toThrow(
    'Wrong value',
  );
  expect(() => gradeReliabilityCase({ ...observation(), observed: new Set() })).toThrow(
    'not observed',
  );
  expect(() =>
    gradeReliabilityCase({ ...observation(), state: { ...observation().state, writes: [] } }),
  ).toThrow('app writes');
  const repeated = observation();
  repeated.state.writes.push({ id: 'note', values: { Body: '42' } });
  expect(() => gradeReliabilityCase(repeated)).toThrow('app writes');
});

it('rejects source tampering, wrong files, and attempts outside the lab', () => {
  expect(() =>
    gradeReliabilityCase({
      ...observation(),
      finalFiles: { 'source.txt': '41', 'note.txt': '42' },
    }),
  ).toThrow('Input was altered');
  expect(() =>
    gradeReliabilityCase({
      ...observation(),
      finalFiles: { 'source.txt': '42', 'note.txt': 'wrong' },
    }),
  ).toThrow('Wrong output');
  expect(() => gradeReliabilityCase({ ...observation(), forbidden: ['other-app'] })).toThrow(
    'leave the disposable',
  );
});

it('requires incomplete tasks to remain visibly incomplete', () => {
  const partial = { ...observation(), scenario: { ...scenario, attention: true } };
  expect(() => gradeReliabilityCase(partial)).toThrow('marked complete');
  expect(() => gradeReliabilityCase({ ...partial, status: 'failed' })).not.toThrow();
});
