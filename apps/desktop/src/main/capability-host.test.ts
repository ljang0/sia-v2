import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connectUnixSocketCapability } from '@sia/tool-bridge';
import { describe, expect, it, vi } from 'vitest';

import { CapabilitySocketHost } from './capability-host.js';

function testHost(): CapabilitySocketHost {
  return new CapabilitySocketHost({
    tools: [
      {
        name: 'browser_tabs',
        description: 'List tabs in the current browser grant.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
      },
    ],
    invoker: { invoke: async (sessionId, toolName) => ({ sessionId, toolName, ok: true }) },
  });
}

async function startHost(host: CapabilitySocketHost): Promise<void> {
  await host.start({
    temporaryDirectory: tmpdir(),
    electronExecutable: process.execPath,
    entryPath: join(tmpdir(), 'sia-tool-bridge-test.js'),
  });
}

function launchValue(spec: { args: readonly string[] }, flag: string): string {
  const index = spec.args.indexOf(flag);
  const value = spec.args[index + 1];
  if (index < 0 || !value) throw new Error(`Missing ${flag}.`);
  return value;
}

function connect(
  spec: { args: readonly string[] },
  sessionId = launchValue(spec, '--session'),
) {
  return connectUnixSocketCapability({
    socketPath: launchValue(spec, '--socket'),
    capabilityId: launchValue(spec, '--capability'),
    sessionId,
  });
}

describe('CapabilitySocketHost', () => {
  it('binds an opaque capability to one ACP session over a private socket', async () => {
    const host = new CapabilitySocketHost({
      tools: [
        {
          name: 'browser_tabs',
          description: 'List tabs in the current browser grant.',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
        },
      ],
      invoker: {
        invoke: async (sessionId, toolName) => ({ sessionId, toolName, ok: true }),
      },
    });
    await host.start({
      temporaryDirectory: tmpdir(),
      electronExecutable: process.execPath,
      entryPath: join(tmpdir(), 'sia-tool-bridge-test.js'),
    });
    try {
      const spec = host.mint('thread-1');
      expect(spec.env).toEqual([{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }]);
      const valueFor = (flag: string): string => {
        const index = spec.args.indexOf(flag);
        const value = spec.args[index + 1];
        if (index < 0 || !value) throw new Error(`Missing ${flag}.`);
        return value;
      };
      const client = await connectUnixSocketCapability({
        socketPath: valueFor('--socket'),
        capabilityId: valueFor('--capability'),
        sessionId: valueFor('--session'),
      });
      expect(client.listTools().map(({ name }) => name)).toEqual(['browser_tabs']);
      await expect(client.invoke('browser_tabs', {})).resolves.toEqual({
        sessionId: 'thread-1',
        toolName: 'browser_tabs',
        ok: true,
      });
      await client.close();
    } finally {
      await host.stop();
    }
  });

  it('keeps a valid capability when another session presents its id', async () => {
    const host = testHost();
    await startHost(host);
    try {
      const spec = host.mint('thread-1');
      await expect(connect(spec, 'thread-2')).rejects.toThrow();
      const client = await connect(spec);
      await expect(client.invoke('browser_tabs', {})).resolves.toMatchObject({ ok: true });
      await client.close();
    } finally {
      await host.stop();
    }
  });

  it('revokes a session’s capabilities when it is replaced or reset, and prunes expired ones', async () => {
    const host = testHost();
    await startHost(host);
    try {
      const first = host.mint('thread-1');
      const replacement = host.mint('thread-1');
      await expect(connect(first)).rejects.toThrow();
      const client = await connect(replacement);
      await client.close();

      host.mint('thread-2');
      host.revokeSession('thread-2');
      expect(host.capabilityCount).toBe(1);

      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 9 * 60 * 60_000);
      host.mint('thread-3');
      expect(host.capabilityCount).toBe(1);
      clock.mockRestore();

      host.revokeAll();
      expect(host.capabilityCount).toBe(0);
    } finally {
      await host.stop();
    }
  });
});
