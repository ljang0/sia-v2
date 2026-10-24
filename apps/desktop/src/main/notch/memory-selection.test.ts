import { expect, it } from 'vitest';
import { memoryExcerpt, selectMemoryNotes } from './memory-selection.js';

it('retrieves saved service hints for natural weekly questions without requiring their stored wording', () => {
  expect(
    selectMemoryNotes(
      'What events do I have through Handshake this week?',
      '- [[campus-tools]] — Career fair registrations at cmu.joinhandshake.com\n- [[recipes]] — cooking',
      ['campus-tools.md', 'recipes.md'],
    ),
  ).toEqual(['campus-tools.md']);
  expect(
    selectMemoryNotes('What is due this week?', '- [[work]] — assignments and deadlines', [
      'work.md',
    ]),
  ).toEqual(['work.md']);
});

it('loads institutional/account hints from the index without relying on the model to open links', () => {
  expect(
    selectMemoryNotes(
      'Find my CU Canvas professors this semester',
      '- [[campus]] — CMU Canvas, Carnegie Mellon, current course navigation\n- [[accounts]] — established profile and work accounts\n- [[recipes]] — cooking',
      ['campus.md', 'accounts.md', 'recipes.md', 'journal.md', 'MOC.md'],
    ),
  ).toEqual(['campus.md', 'accounts.md']);
  expect(
    selectMemoryNotes('What homework is due?', '- [[study]] — assignments and deadlines', [
      'study.md',
    ]),
  ).toEqual(['study.md']);
});

it('finds content-only account associations and retrieves the relevant passage late in a long note', () => {
  const text =
    'Unrelated historical notes.\n'.repeat(500) +
    '\nCMU Canvas at Carnegie Mellon uses the university account for current professors.\n' +
    'Other notes.\n'.repeat(300);
  const contents = new Map([
    ['notes.md', text],
    ['cooking.md', 'Soup and recipes'],
  ]);
  expect(
    selectMemoryNotes('Find my professors at CMU', '', ['notes.md', 'cooking.md'], contents),
  ).toEqual(['notes.md']);
  const passage = memoryExcerpt(text, 'Find my professors at CMU');
  expect(passage.text).toContain('CMU Canvas at Carnegie Mellon');
  expect(passage.text.length).toBeLessThanOrEqual(4000);
  expect(passage.truncated).toBe(true);
  expect(
    selectMemoryNotes(
      'continue with that',
      '',
      ['notes.md'],
      contents,
      'Find my professors through Canvas',
    ),
  ).toEqual(['notes.md']);
  expect(selectMemoryNotes('hi', '', ['notes.md'], contents, 'Find Canvas professors')).toEqual(
    [],
  );
});

it('ignores empty/generic requests, unsafe links, scripts and unrelated notes', () => {
  const index = '- [[../outside]] — Canvas\n- [[skills/canvas]] — Canvas\n- [[recipes]] — soup';
  expect(selectMemoryNotes('please do it', index, ['recipes.md'])).toEqual([]);
  expect(
    selectMemoryNotes('Canvas', index, ['../outside.md', 'skills/canvas.sh', 'recipes.md']),
  ).toEqual([]);
});

it('bounds retrieval and ranks filename evidence above incidental mentions', () => {
  const names = ['z.md', 'a.md', 'b.md', 'c.md', 'calendar.md'];
  const index = names.map((name) => `- [[${name.slice(0, -3)}|Alias]] — calendar`).join('\n');
  expect(selectMemoryNotes('calendar', index, names)).toEqual([
    'calendar.md',
    'a.md',
    'b.md',
    'c.md',
  ]);
});

it('retrieves relevant notes beyond the first 200 filenames without expanding the read budget', () => {
  const names = Array.from({ length: 250 }, (_, i) => `archive-${i}.md`);
  names.push('z-campus.md', 'z-work.md', 'z-unrelated.md');
  expect(
    selectMemoryNotes(
      'Find my professors this semester',
      '- [[z-campus]] — current courses and instructors\n- [[z-work]] — campus account profile',
      names,
    ),
  ).toEqual(['z-campus.md', 'z-work.md']);
});
