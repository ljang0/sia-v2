import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SMOKE_MCP_SERVER,
  SMOKE_RESULT,
  startHarnessEndpointStub,
} from './harness-endpoint-stub.js';
import { createOpenCodeAdapter } from './providers/opencode.js';

/**
 * Opt-in: runs a real OpenCode against a loopback Responses stub, the way Sia's model proxy
 * serves an included model. No network, account, or model turn is used.
 *
 *   SIA_OPENCODE_ENDPOINT_SMOKE=1 SIA_OPENCODE_COMMAND=/abs/path/opencode \
 *     pnpm --filter @sia/runtime exec vitest run src/opencode-endpoint.smoke.test.ts
 */
const runReal = process.env.SIA_OPENCODE_ENDPOINT_SMOKE === '1';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((step) => step()));
});

describe.runIf(runReal)('real OpenCode on a loopback model endpoint', () => {
  it('uses only the scoped Sia model and tools and completes a Sia tool loop', async () => {
    const stub = await startHarnessEndpointStub();
    cleanup.push(() => stub.close());
    const workspace = await mkdtemp(join(tmpdir(), 'sia-opencode-workspace-'));
    cleanup.push(() => rm(workspace, { recursive: true, force: true }));
    const tools = await mkdtemp(join(tmpdir(), 'sia-opencode-tools-'));
    cleanup.push(() => rm(tools, { recursive: true, force: true }));
    const serverPath = join(tools, 'sia-smoke-mcp.mjs');
    await writeFile(serverPath, SMOKE_MCP_SERVER, { encoding: 'utf8', mode: 0o700 });

    const adapter = createOpenCodeAdapter({
      providerId: 'meta',
      accountOverride: {
        state: 'authenticated',
        label: 'Included with Sia',
        billing: 'included',
      },
      command: process.env.SIA_OPENCODE_COMMAND ?? 'opencode',
      modelEndpoint: async () => ({ baseUrl: stub.baseUrl, apiKey: 'loopback-capability' }),
      mcpServerFactory: () => [
        { name: 'sia', command: process.execPath, args: [serverPath], env: [] },
      ],
      requestTimeoutMs: 60_000,
    });
    cleanup.push(() => adapter.dispose());
    await expect(adapter.probe()).resolves.toMatchObject({ available: true, supported: true });
    const session = await adapter.createSession({
      threadId: 'opencode-endpoint-smoke',
      model: 'sponsor/model',
      workspace,
      instructions: '',
      tools: [],
    });
    const events = [];
    for await (const event of adapter.sendTurn(session, {
      turnId: 'opencode-endpoint-turn',
      text: 'Call the Sia smoke_tool once, then reply with exactly its returned value.',
    })) {
      events.push(event);
    }

    expect(stub.requests.length).toBeGreaterThanOrEqual(2);
    for (const request of stub.requests) {
      expect(request.path).toBe('/v1/responses');
      expect(request.authorization).toBe('Bearer loopback-capability');
      expect(request.body.model).toBe('sponsor/model');
      const offered = (Array.isArray(request.body.tools) ? request.body.tools : []).map(
        (tool: Record<string, unknown>) => String(tool.name),
      );
      // OpenCode's own shell, file and web tools are never offered to the model.
      expect(offered.every((name) => name.startsWith('sia_'))).toBe(true);
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
  }, 120_000);
});
