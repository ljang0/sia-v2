import { expect, it } from 'vitest';
import { parseActionArguments } from './index.js';

it('validates checkpoint operations, evidence, scope entries and bounded payloads', () => {
  const state = {
    summary: 'Task',
    constraints: [],
    associations: [],
    scope_complete: false,
    coverage: [],
    actions: [],
    next_steps: [],
  };
  expect(parseActionArguments('task_checkpoint', { operation: 'read' })).toEqual({
    operation: 'read',
  });
  for (const input of [
    { operation: 'update', state },
    { operation: 'read', state },
    { operation: 'read', thread_id: 'another-thread' },
    { operation: 'update', turn_id: 'old-turn', expected_revision: 0, state },
    {
      operation: 'update',
      expected_revision: 0,
      state: { ...state, coverage: [{ source: 'Course', status: 'checked', finding: '' }] },
    },
    {
      operation: 'update',
      expected_revision: 0,
      state: { ...state, actions: [{ description: 'Send', status: 'verified', evidence: '' }] },
    },
  ])
    expect(() => parseActionArguments('task_checkpoint', input)).toThrow();
  expect(
    parseActionArguments('task_checkpoint', {
      operation: 'update',
      expected_revision: 0,
      state,
    }),
  ).toMatchObject({ state });
});
