import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SMOKE_MCP_SERVER,
  SMOKE_RESULT,
  startHarnessEndpointStub,
} from './harness-endpoint-stub.js';
import { createOpenHandsAdapter } from './providers/openhands.js';

/**
 * Opt-in: runs a real OpenHands CLI against a loopback Chat Completions stub, the way Sia's
 * model proxy serves an included model. No network model, account, or model turn is used.
 *
 *   SIA_OPENHANDS_ENDPOINT_SMOKE=1 SIA_OPENHANDS_COMMAND=/abs/path/openhands \
 *     pnpm --filter @sia/runtime exec vitest run src/openhands-endpoint.smoke.test.ts
 */
const runReal = process.env.SIA_OPENHANDS_ENDPOINT_SMOKE === '1';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((step) => step()));
});

describe.runIf(runReal)('real OpenHands on a loopback model endpoint', () => {
  it('asks Sia before every action and completes a Sia tool loop on the scoped model', async () => {
    const stub = await startHarnessEndpointStub();
    cleanup.push(() => stub.close());
    const workspace = await mkdtemp(join(tmpdir(), 'sia-openhands-workspace-'));
    cleanup.push(() => rm(workspace, { recursive: true, force: true }));
    const tools = await mkdtemp(join(tmpdir(), 'sia-openhands-tools-'));
    cleanup.push(() => rm(tools, { recursive: true, force: true }));
    const serverPath = join(tools, 'sia-smoke-mcp.mjs');
    await writeFile(serverPath, SMOKE_MCP_SERVER, { encoding: 'utf8', mode: 0o700 });

    const adapter = createOpenHandsAdapter({
      providerId: 'meta',
      accountOverride: {
        state: 'authenticated',
        label: 'Included with Sia',
        billing: 'included',
      },
      command: process.env.SIA_OPENHANDS_COMMAND ?? 'openhands',
      modelEndpoint: async () => ({ baseUrl: stub.baseUrl, apiKey: 'loopback-capability' }),
      mcpServerFactory: () => [
        { name: 'sia', command: process.execPath, args: [serverPath], env: [] },
      ],
      requestTimeoutMs: 120_000,
    });
    cleanup.push(() => adapter.dispose());
    await expect(adapter.probe()).resolves.toMatchObject({ available: true, supported: true });
    const session = await adapter.createSession({
      threadId: 'openhands-endpoint-smoke',
      model: 'sponsor/model',
      workspace,
      instructions: '',
      tools: [],
    });
    const events = [];
    let approvals = 0;
    for await (const event of adapter.sendTurn(session, {
      turnId: 'openhands-endpoint-turn',
      text: 'Call the Sia smoke_tool once, then reply with exactly its returned value.',
    })) {
      events.push(event);
      if (event.type === 'approval' && event.payload.phase === 'requested') {
        approvals += 1;
        // Sia's own decision id; the adapter maps it to OpenHands' allow-once option.
        await adapter.respondToRequest(session, {
          requestId: event.payload.requestId,
          choiceId: 'allow_once',
        });
      }
    }

    expect(approvals).toBeGreaterThanOrEqual(1);
    expect(stub.requests.length).toBeGreaterThanOrEqual(2);
    for (const request of stub.requests) {
      expect(request.path).toBe('/v1/chat/completions');
      expect(request.authorization).toBe('Bearer loopback-capability');
      expect(request.body.model).toBe('sponsor/model');
    }
    expect(JSON.stringify(stub.requests.at(-1)?.body)).toContain(SMOKE_RESULT);
    const text = events
      .filter((event) => event.type === 'message')
      .flatMap((event) => event.payload.parts)
      .filter((part) => part.kind === 'text')
      .map((part) => part.text)
      .join('');
    expect(text).toContain(SMOKE_RESULT);
    expect(events.at(-1)).toMatchObject({
      type: 'completion',
      payload: { status: 'completed' },
    });
    expect(await readdir(workspace)).toEqual([]);
  }, 240_000);
});
