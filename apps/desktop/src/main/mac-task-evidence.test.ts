import { describe, expect, it } from 'vitest';
import {
  getActionToolDescriptor,
  type ActionToolName,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { MacTaskEvidence } from './mac-task-evidence.js';

function request(
  name: ActionToolName,
  args: Record<string, unknown> = {},
  turnId = 'turn',
): ValidatedActionInvocation {
  return {
    name,
    arguments: args,
    descriptor: getActionToolDescriptor(name)!,
    context: {
      sessionId: 'session',
      threadId: 'thread',
      turnId,
      provider: 'codex',
      workspace: '/tmp',
    },
  };
}

describe('Mac task evidence', () => {
  it('requires an exact quotation from an observation in the same turn', () => {
    const evidence = new MacTaskEvidence();
    const observed = evidence.observe(request('computer_snapshot'), {
      outcome: 'verified',
      summary: 'Observed',
      data: { elements: [{ label: 'Fall 2026', value: 'Professor Example' }] },
    });
    const item = {
      requirement: 'Find instructor',
      status: 'verified',
      evidence_id: (observed.data as Record<string, unknown>).evidence_id,
      kind: 'text',
      quote: 'Fall 2026 Professor Example',
      finding: 'Professor Example teaches this class in Fall 2026.',
    };
    expect(
      evidence.complete(request('computer_task_complete', { items: [item] })).outcome,
    ).toBe('verified');
    expect(
      evidence.complete(request('computer_task_complete', { items: [item] }, 'another-turn'))
        .outcome,
    ).toBe('refused');
    expect(
      evidence.complete(
        request('computer_task_complete', {
          items: [{ ...item, quote: 'Professor Invented' }],
        }),
      ).outcome,
    ).toBe('refused');
    expect(
      evidence.complete(
        request('computer_task_complete', { items: [{ ...item, kind: 'visual', quote: '' }] }),
      ).outcome,
    ).toBe('refused');
  });

  it.each([{ loading: true }, { observation_pending: true }])(
    'does not admit unfinished observations %j',
    (state) => {
      const evidence = new MacTaskEvidence();
      const result = evidence.observe(request('computer_snapshot'), {
        outcome: 'verified',
        summary: 'Loading',
        data: { ...state, elements: [{ label: 'Syllabus.docx' }] },
      });
      expect((result.data as Record<string, unknown>).evidence_id).toBeUndefined();
    },
  );

  it('reports explicit blockers without pretending the task is fully verified', () => {
    const evidence = new MacTaskEvidence();
    const result = evidence.complete(
      request('computer_task_complete', {
        items: [
          {
            requirement: 'Read syllabus',
            status: 'blocked',
            reason: 'The document preview remained loading after two new observations.',
          },
        ],
      }),
    );
    expect(result.outcome).toBe('verified');
    expect((result.data as Record<string, unknown>).task_status).toBe('blocked');
  });
});
