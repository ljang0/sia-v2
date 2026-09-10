import { describe, expect, it } from 'vitest';
import {
  getActionToolDescriptor,
  type ActionToolName,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { MacTaskEvidence, unsupportedNumericClaims } from './mac-task-evidence.js';

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
      expect((result.data as Record<string, unknown>).evidence_kind).toBe('blocker');
      expect(
        evidence.complete(
          request('computer_task_complete', {
            items: [
              {
                requirement: 'Read document',
                status: 'verified',
                kind: 'text',
                quote: 'Syllabus.docx',
                finding: 'Read syllabus',
                evidence_id: (result.data as Record<string, unknown>).evidence_id,
              },
            ],
          }),
        ).outcome,
      ).toBe('refused');
    },
  );

  it('reports explicit blockers without pretending the task is fully verified', () => {
    const evidence = new MacTaskEvidence();
    const observed = evidence.observe(request('computer_snapshot'), {
      outcome: 'refused',
      summary: 'This window could not be identified.',
    });
    const result = evidence.complete(
      request('computer_task_complete', {
        items: [
          {
            requirement: 'Read syllabus',
            status: 'blocked',
            reason: 'This window could not be identified.',
            quote: 'This window could not be identified.',
            evidence_id: (observed.data as Record<string, unknown>).evidence_id,
          },
        ],
      }),
    );
    expect(result.outcome).toBe('verified');
    expect((result.data as Record<string, unknown>).task_status).toBe('blocked');
  });
  it('rejects the recorded Calculator hallucination even when a screenshot exists', () => {
    const evidence = new MacTaskEvidence();
    const observed = evidence.observe(request('computer_snapshot'), {
      outcome: 'verified',
      summary: 'Calculator',
      images: [{ mimeType: 'image/png', dataBase64: 'image' }],
      data: { visible_text: '7 × 24 + 86\n254', elements: [] },
    });
    const item = {
      requirement: 'Read Calculator result',
      status: 'verified',
      kind: 'visual',
      quote: '',
      evidence_id: (observed.data as Record<string, unknown>).evidence_id,
      finding: 'Calculator shows 3,374.',
    };
    expect(
      evidence.complete(request('computer_task_complete', { items: [item] })),
    ).toMatchObject({ outcome: 'refused', summary: expect.stringContaining('3374') });
    expect(
      evidence.complete(
        request('computer_task_complete', {
          items: [{ ...item, kind: 'text', quote: '254', finding: 'Calculator shows 254.' }],
        }),
      ).outcome,
    ).toBe('verified');
  });

  it('does not let a window identification failure become a made-up login blocker', () => {
    const evidence = new MacTaskEvidence();
    evidence.observe(request('computer_snapshot'), {
      outcome: 'verified',
      summary: 'Canvas',
      data: {
        app_id: 'safari',
        window_id: 'dashboard',
        title: 'Dashboard',
        browser_origin: 'https://canvas.cmu.edu',
        visible_text: 'Fall 2026 courses',
      },
    });
    const failure = evidence.observe(request('computer_snapshot'), {
      outcome: 'refused',
      summary: 'This specific window could not be identified.',
      data: { app_id: 'safari', window_id: 'unrelated' },
    });
    expect((failure.data as Record<string, unknown>).previously_observed_windows).toEqual([
      {
        app_id: 'safari',
        window_id: 'dashboard',
        title: 'Dashboard',
        browser_origin: 'https://canvas.cmu.edu',
      },
    ]);
    const result = evidence.complete(
      request('computer_task_complete', {
        items: [
          {
            requirement: 'Read Canvas',
            status: 'blocked',
            evidence_id: (failure.data as Record<string, unknown>).evidence_id,
            quote: 'This specific window could not be identified.',
            reason: 'Canvas requires sign-in.',
          },
        ],
      }),
    );
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('verbatim');
  });

  it('normalizes display grouping but does not invent numbers from individual keys', () => {
    expect(unsupportedNumericClaims('Result: 3,374', '3 3 7 4 254')).toEqual(['3374']);
    expect(unsupportedNumericClaims('Result: 3374', '3,374')).toEqual([]);
    expect(unsupportedNumericClaims('1. Result: 254', '254')).toEqual([]);
    expect(unsupportedNumericClaims('Courses 07-128, 15-151', '07128-A 15151-H')).toEqual([]);
    expect(unsupportedNumericClaims('Course 07128', '07-128')).toEqual([]);
    expect(unsupportedNumericClaims('Result 3374', '137-24')).toEqual(['3374']);
  });
});
