import { expect, it } from 'vitest';
import type { AssistantMemory } from '../../shared/assistant-library.js';
import { promptMemories } from './memory-context.js';

it('includes relevant preferences beyond the old prefix without cutting entries or crossing agents', () => {
  const memories: AssistantMemory[] = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    agentId: 'agent',
    title: `General ${index}`,
    text: 'General writing preference. '.repeat(130),
    enabled: true,
  }));
  memories.push(
    {
      id: 'campus',
      agentId: 'agent',
      title: 'Campus account',
      text: 'CMU means Carnegie Mellon. Canvas is the current course source.',
      enabled: true,
    },
    {
      id: 'foreign',
      agentId: 'other',
      title: 'Canvas',
      text: 'OTHER PERSON ACCOUNT',
      enabled: true,
    },
    {
      id: 'deleted',
      agentId: 'agent',
      title: 'Canvas',
      text: 'DISABLED ACCOUNT',
      enabled: false,
    },
    {
      id: 'credential',
      agentId: 'agent',
      title: 'Canvas',
      text: 'api_key=synthetic-private-value',
      enabled: true,
    },
  );
  const selected = promptMemories(memories, 'agent', 'Find my CMU professors through Canvas');
  expect(selected[0]?.title).toBe('Campus account');
  expect(JSON.stringify(selected).length).toBeLessThan(16000);
  for (const entry of selected)
    expect(
      memories.some((memory) => memory.title === entry.title && memory.text === entry.text),
    ).toBe(true);
  expect(JSON.stringify(selected)).not.toMatch(/OTHER PERSON|DISABLED|synthetic-private/);
});

it.each([
  'https://meeting.example/j/123?pwd=fixture-private',
  'https://files.example/doc?X-Amz-Signature=fixture-private',
  'https://files.example/doc?accessToken=fixture-private',
  'https://fixture-user:fixture-private@files.example/doc',
  'https://files.example/redirect?next=https%3A%2F%2Ffiles.example%2Fdoc%3Fpwd%3Dfixture-private',
])('omits an access-bearing link from derived saved context: %s', (url) => {
  const memories: AssistantMemory[] = [
    { id: 'private', agentId: 'agent', title: 'Saved source', text: url, enabled: true },
    {
      id: 'safe',
      agentId: 'agent',
      title: 'Public source',
      text: 'https://campus.example/courses?term=fall',
      enabled: true,
    },
  ];
  expect(promptMemories(memories, 'agent', 'Find my saved source')).toEqual([
    { title: 'Public source', text: memories[1]!.text },
  ]);
});
