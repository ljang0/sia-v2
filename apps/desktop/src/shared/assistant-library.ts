import { z } from 'zod';

const id = z.string().uuid();
const memorySchema = z
  .object({
    id: id.optional(),
    agentId: id,
    title: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(4000),
    enabled: z.boolean(),
    learned: z.boolean().optional(),
  })
  .strict();
const workflowSchema = z
  .object({
    id: id.optional(),
    agentId: id,
    title: z.string().trim().min(1).max(100),
    parameters: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(12),
    steps: z
      .array(
        z
          .object({
            instruction: z.string().trim().min(1).max(2000),
            expected: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    (v) => new Set(v.parameters).size === v.parameters.length,
    'Parameter names must be unique.',
  )
  .refine(
    (v) =>
      v.steps.every((step) =>
        [
          ...(step.instruction + ' ' + step.expected).matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g),
        ].every((match) => v.parameters.includes(match[1]!)),
      ),
    'Every referenced parameter needs an input name.',
  );
const skillSchema = z
  .object({
    id: id.optional(),
    agentId: id,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    source: z.string().min(1).max(16000),
    execution: z.enum(['gateway', 'native']).optional(),
  })
  .strict();
export const assistantLibraryCommand = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('saveVaultNote'),
      agentId: id,
      name: z.string().min(1).max(160),
      text: z.string().max(256000),
      revision: z.string().regex(/^(?:[a-f0-9]{64})?$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal('deleteVaultNote'),
      agentId: id,
      name: z.string().min(1).max(160),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({ operation: z.literal('nativeLearning'), agentId: id, enabled: z.boolean() })
    .strict(),
  z.object({ operation: z.literal('saveSkill'), entry: skillSchema }).strict(),
  z.object({ operation: z.literal('deleteSkill'), id }).strict(),
  z
    .object({
      operation: z.literal('runSkill'),
      id,
      input: z
        .record(z.string().max(100), z.string().max(2000))
        .refine((value) => Object.keys(value).length <= 12),
    })
    .strict(),
  z.object({ operation: z.literal('learning'), agentId: id, enabled: z.boolean() }).strict(),
  z.object({ operation: z.literal('consolidate'), agentId: id }).strict(),
  z.object({ operation: z.literal('clearJournal'), agentId: id }).strict(),
  z.object({ operation: z.literal('list') }).strict(),
  z.object({ operation: z.literal('review'), agentId: id }).strict(),
  z
    .object({ operation: z.literal('backgroundReview'), agentId: id, enabled: z.boolean() })
    .strict(),
  z
    .object({
      operation: z.literal('resolveSuggestion'),
      id,
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      accept: z.boolean(),
    })
    .strict(),
  z.object({ operation: z.literal('saveMemory'), entry: memorySchema }).strict(),
  z.object({ operation: z.literal('saveWorkflow'), entry: workflowSchema }).strict(),
  z.object({ operation: z.literal('deleteMemory'), id }).strict(),
  z.object({ operation: z.literal('deleteWorkflow'), id }).strict(),
  z.object({ operation: z.literal('preferences'), context: z.boolean() }).strict(),
  z
    .object({
      operation: z.literal('run'),
      id,
      values: z.record(z.string(), z.string().max(2000)),
    })
    .strict(),
]);
export type AssistantLibraryCommand = z.infer<typeof assistantLibraryCommand>;
export type AssistantMemory = z.infer<typeof memorySchema> & { id: string };
export type AssistantWorkflow = z.infer<typeof workflowSchema> & { id: string };
export type AssistantSkill = z.infer<typeof skillSchema> & {
  id: string;
  revision: string;
  path?: string;
};
export interface AssistantJournalEntry {
  id: string;
  agentId: string;
  threadId: string;
  turnId: string;
  timestamp: string;
  kind: 'task' | 'lesson' | 'action';
  title: string;
  text: string;
  consolidated?: boolean;
  outcome?: 'complete' | 'failed' | 'blocked' | 'cancelled';
}
export interface AssistantSuggestion {
  id: string;
  agentId: string;
  revision: string;
  createdAt: string;
  kind: 'merge' | 'retire' | 'skill' | 'lesson';
  nativeWorkspace?: string;
  title: string;
  reason: string;
  text: string;
  description: string;
  source: string;
  memories: AssistantMemory[];
  evidence: AssistantJournalEntry[];
}
export interface AssistantLibraryView {
  vaults?: {
    agentId: string;
    notes: { name: string; text: string; revision: string; readOnly: boolean }[];
  }[];
  launcherRegistered?: boolean;
  suggestions?: AssistantSuggestion[];
  reviewAgents?: string[];
  lastReview?: Record<string, string>;
  memories: AssistantMemory[];
  workflows: AssistantWorkflow[];
  context: boolean;
  skills?: AssistantSkill[];
  journal?: AssistantJournalEntry[];
  learningAgents?: string[];
  nativeLearningAgents?: string[];
  lastConsolidated?: Record<string, string>;
  threadId?: string;
}
