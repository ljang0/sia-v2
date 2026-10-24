import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);

/** Task-local working state, not a cross-agent memory or authority to act. */
export const taskCheckpointState = z
  .object({
    summary: text(1500),
    constraints: z.array(text(400)).max(12),
    associations: z
      .array(z.object({ name: text(100), value: text(300), source: text(500) }).strict())
      .max(8),
    scope_complete: z.boolean(),
    coverage: z
      .array(
        z
          .object({
            source: text(300).min(1),
            status: z.enum(['pending', 'checked', 'blocked', 'excluded']),
            finding: text(800),
          })
          .strict(),
      )
      .max(40),
    actions: z
      .array(
        z
          .object({
            description: text(300).min(1),
            status: z.enum(['verified', 'uncertain', 'reverted']),
            evidence: text(500),
          })
          .strict(),
      )
      .max(20)
      .describe(
        'Writes actually attempted in this task. Do not list recommendations or hypothetical future actions.',
      ),
    next_steps: z
      .array(text(300))
      .max(8)
      .describe(
        'Unfinished work required for the current requested deliverable. Future recommendations belong in the answer or summary.',
      ),
  })
  .strict()
  .refine(
    (state) =>
      state.coverage.every(
        (entry) => !['checked', 'excluded'].includes(entry.status) || !!entry.finding,
      ) &&
      state.actions.every((entry) => entry.status === 'uncertain' || !!entry.evidence) &&
      state.associations.every((entry) => !!entry.name && !!entry.value && !!entry.source),
    'Checked sources, verified actions and account associations need their supporting evidence.',
  )
  .refine(
    (state) =>
      new Set(state.coverage.map((entry) => entry.source)).size === state.coverage.length &&
      new Set(state.actions.map((entry) => entry.description)).size === state.actions.length,
    'List each source and action once.',
  )
  .refine((state) => JSON.stringify(state).length <= 24_000, 'Keep the checkpoint concise.');

export const taskCheckpoint = z
  .object({
    operation: z.enum(['read', 'update']),
    turn_id: text(512).min(1).optional(),
    expected_revision: z.number().int().min(0).optional(),
    state: taskCheckpointState.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.operation === 'update'
        ? input.expected_revision !== undefined &&
          input.state !== undefined &&
          input.turn_id === undefined
        : input.expected_revision === undefined && input.state === undefined,
    'Read takes no state. Update requires the current expected_revision and the complete state.',
  );

export type TaskCheckpointState = z.infer<typeof taskCheckpointState>;
