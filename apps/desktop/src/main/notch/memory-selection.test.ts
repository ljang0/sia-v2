import { expect, it } from 'vitest';
import { selectMemoryNotes } from './memory-selection.js';

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
