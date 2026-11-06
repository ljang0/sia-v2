import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAppServerAdapter } from './providers/codex.js';

const realSmoke = process.env.SIA_CODEX_IMAGE_SMOKE === '1' ? it : it.skip;

describe('Codex dynamic-tool image handoff', () => {
  realSmoke(
    'reads facts available only in a tool image through the real provider',
    async () => {
      const fixture = process.env.SIA_CODEX_IMAGE_FIXTURE;
      const expectedJson = process.env.SIA_CODEX_IMAGE_EXPECT;
      if (!fixture || !expectedJson)
        throw new Error('Supply a non-sensitive PNG fixture and expected text JSON array.');
      const expected: unknown = JSON.parse(expectedJson);
      if (
        !Array.isArray(expected) ||
        expected.length < 2 ||
        !expected.every((value): value is string => typeof value === 'string' && !!value.trim())
      )
        throw new Error('Expected text must contain at least two non-empty strings.');
      const bytes = await readFile(fixture);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
      const workspace = await mkdtemp(join(tmpdir(), 'sia-image-handoff-'));
      const calls: string[] = [];
      const adapter = new CodexAppServerAdapter({
        sessionEphemeral: true,
        ...(process.env.SIA_CODEX_IMAGE_COMMAND
          ? { command: process.env.SIA_CODEX_IMAGE_COMMAND }
          : {}),
        dynamicToolHandler: async (call) => {
          calls.push(call.name);
          return {
            success: true,
            content: {
              outcome: 'verified',
              summary: 'Read the returned screenshot.',
              images: [{ mimeType: 'image/png', dataBase64: bytes.toString('base64') }],
            },
          };
        },
      });
      try {
        const session = await adapter.createSession({
          threadId: randomUUID(),
          workspace,
          model: process.env.SIA_SMOKE_MODEL ?? 'gpt-5.6-terra',
          nativeTools: 'mac-hosted',
          nativeApproval: 'auto',
          baseInstructions: 'You are Sia, a visual desktop assistant. Read images directly.',
          instructions: 'Read-only image transport test. No UI actions are available.',
          tools: [
            {
              name: 'computer_snapshot',
              description: 'Return one saved screenshot as an image without any UI action.',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              annotations: {
                readOnly: true,
                requiresApproval: false,
                takesForeground: false,
              },
            },
          ],
        });
        let answer = '';
        let completed = false;
        for await (const event of adapter.sendTurn(
          session,
          {
            turnId: randomUUID(),
            text: 'Call computer_snapshot exactly once. Read its image and transcribe the visible text, including filenames and field values. Do not infer missing text. If no image is visible, say so.',
          },
          AbortSignal.timeout(90_000),
        )) {
          if (event.type === 'message' && !event.payload.delta)
            answer += event.payload.parts
              .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
              .join('\n');
          if (event.type === 'completion') completed = event.payload.status === 'completed';
        }
        expect(completed).toBe(true);
        expect(calls).toEqual(['computer_snapshot']);
        // Expected facts never enter the prompt, tool metadata or file path seen by the model.
        for (const fact of expected) expect(answer).toContain(fact);
      } finally {
        await adapter.dispose();
        await rm(workspace, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
