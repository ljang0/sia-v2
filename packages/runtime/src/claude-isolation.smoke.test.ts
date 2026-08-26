import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeCliAdapter } from './providers/claude.js';

const runReal = process.env.SIA_CLAUDE_REAL_SMOKE === '1';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.runIf(runReal)('real Claude CLI isolation', () => {
  it('uses authenticated non-persistent print mode without writing provider state to the workspace', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-claude-workspace-'));
    temporaryDirectories.push(workspace);
    const serverPath = join(workspace, 'sia-smoke-mcp.mjs');
    await writeFile(
      serverPath,
      [
        "import { createInterface } from 'node:readline';",
        'const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });',
        'for await (const line of lines) {',
        '  const request = JSON.parse(line);',
        '  if (request.id == null) continue;',
        "  if (request.method === 'initialize') respond(request.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sia-smoke', version: '1.0.0' } });",
        "  else if (request.method === 'tools/list') respond(request.id, { tools: [{ name: 'smoke_tool', description: 'Return the fixed Sia smoke value.', inputSchema: { type: 'object', additionalProperties: false, properties: {} } }] });",
        "  else if (request.method === 'tools/call') respond(request.id, { content: [{ type: 'text', text: 'SIA_TOOL_RESULT' }], isError: false });",
        '  else respond(request.id, {});',
        '}',
        "function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
      ].join('\n'),
      { encoding: 'utf8', mode: 0o700 },
    );
    const adapter = new ClaudeCliAdapter({
      maxTurns: 3,
      mcpServerFactory: () => [{ name: 'sia', command: process.execPath, args: [serverPath] }],
    });
    try {
      await expect(adapter.probe()).resolves.toMatchObject({
        available: true,
        supported: true,
      });
      await expect(adapter.account()).resolves.toMatchObject({ state: 'authenticated' });
      const session = await adapter.createSession({
        threadId: 'claude-real-smoke',
        model: 'sonnet',
        workspace,
        instructions: 'Use the supplied Sia tool when the user requests it.',
        tools: [
          {
            name: 'smoke_tool',
            description: 'Return the fixed Sia smoke value.',
            inputSchema: { type: 'object', additionalProperties: false, properties: {} },
            annotations: {
              readOnly: true,
              requiresApproval: false,
              takesForeground: false,
            },
          },
        ],
      });
      const events = [];
      for await (const event of adapter.sendTurn(session, {
        turnId: 'claude-real-turn',
        text: 'Call the Sia smoke_tool once, then reply with exactly its returned value.',
      })) {
        events.push(event);
      }
      const text = events
        .filter((event) => event.type === 'message')
        .flatMap((event) => event.payload.parts)
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('');
      expect(text).toContain('SIA_TOOL_RESULT');
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tool',
            payload: expect.objectContaining({ name: 'smoke_tool', phase: 'started' }),
          }),
          expect.objectContaining({
            type: 'tool',
            payload: expect.objectContaining({ name: 'smoke_tool', phase: 'completed' }),
          }),
        ]),
      );
      expect(events.at(-1)).toMatchObject({
        type: 'completion',
        payload: { status: 'completed' },
      });
      expect(await readdir(workspace)).toEqual(['sia-smoke-mcp.mjs']);
    } finally {
      await adapter.dispose();
    }
  }, 60_000);
});
