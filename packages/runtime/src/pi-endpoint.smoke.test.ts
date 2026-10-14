import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ThreadEventEnvelope } from '@sia/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SMOKE_MCP_SERVER,
  SMOKE_RESULT,
  startHarnessEndpointStub,
} from './harness-endpoint-stub.js';
import { createPiAdapter } from './providers/pi.js';

/**
 * Opt-in: runs a real Pi against a loopback Responses stub, the way Sia's model proxy serves an
 * included model. No network model, account, or model turn is used.
 *
 *   SIA_PI_ENDPOINT_SMOKE=1 SIA_PI_COMMAND=/abs/path/pi \
 *     pnpm --filter @sia/runtime exec vitest run src/pi-endpoint.smoke.test.ts
 */
const runReal = process.env.SIA_PI_ENDPOINT_SMOKE === '1';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((step) => step()));
});

function text(events: readonly ThreadEventEnvelope[]): string {
  return events
    .filter((event) => event.type === 'message')
    .flatMap((event) => event.payload.parts)
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('');
}

describe.runIf(runReal)('real Pi on a loopback model endpoint', () => {
  it('uses only Sia tools on the scoped model across turns of one session', async () => {
    const stub = await startHarnessEndpointStub();
    cleanup.push(() => stub.close());
    const workspace = await mkdtemp(join(tmpdir(), 'sia-pi-workspace-'));
    cleanup.push(() => rm(workspace, { recursive: true, force: true }));
    const tools = await mkdtemp(join(tmpdir(), 'sia-pi-tools-'));
    cleanup.push(() => rm(tools, { recursive: true, force: true }));
    const serverPath = join(tools, 'sia-smoke-mcp.mjs');
    await writeFile(serverPath, SMOKE_MCP_SERVER, { encoding: 'utf8', mode: 0o700 });

    const adapter = createPiAdapter({
      providerId: 'meta',
      accountOverride: {
        state: 'authenticated',
        label: 'Included with Sia',
        billing: 'included',
      },
      command: process.env.SIA_PI_COMMAND ?? 'pi',
      modelEndpoint: async () => ({ baseUrl: stub.baseUrl, apiKey: 'loopback-capability' }),
      mcpServerFactory: () => [
        { name: 'sia', command: process.execPath, args: [serverPath], env: [] },
      ],
    });
    cleanup.push(() => adapter.dispose());
    await expect(adapter.probe()).resolves.toMatchObject({ available: true, supported: true });
    const session = await adapter.createSession({
      threadId: 'pi-endpoint-smoke',
      model: 'sponsor/model',
      workspace,
      instructions: 'Answer briefly.',
      tools: [],
    });
    const run = async (turnId: string, prompt: string) => {
      const events: ThreadEventEnvelope[] = [];
      for await (const event of adapter.sendTurn(session, { turnId, text: prompt })) {
        events.push(event);
      }
      return events;
    };

    const first = await run(
      'pi-turn-1',
      'Call the Sia smoke_tool once, then reply with exactly its returned value.',
    );
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool',
          payload: expect.objectContaining({ name: 'smoke_tool', phase: 'completed' }),
        }),
      ]),
    );
    expect(text(first)).toContain(SMOKE_RESULT);
    expect(first.at(-1)).toMatchObject({
      type: 'completion',
      payload: { status: 'completed' },
    });

    // A second turn in the same session still streams and settles.
    const second = await run('pi-turn-2', 'Repeat the value.');
    expect(text(second)).toContain(SMOKE_RESULT);
    expect(second.at(-1)).toMatchObject({
      type: 'completion',
      payload: { status: 'completed' },
    });

    expect(stub.requests.length).toBeGreaterThanOrEqual(3);
    for (const request of stub.requests) {
      expect(request.path).toBe('/v1/responses');
      expect(request.authorization).toBe('Bearer loopback-capability');
      expect(request.body.model).toBe('sponsor/model');
      const offered = (Array.isArray(request.body.tools) ? request.body.tools : []).map(
        (tool: Record<string, unknown>) => String(tool.name),
      );
      expect(offered).toEqual(['mcp__sia__smoke_tool']);
    }
    expect(await readdir(workspace)).toEqual([]);
  }, 180_000);
});
