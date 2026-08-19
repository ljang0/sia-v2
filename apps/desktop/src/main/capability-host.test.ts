import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connectUnixSocketCapability } from '@sia/tool-bridge';
import { describe, expect, it } from 'vitest';

import { CapabilitySocketHost } from './capability-host.js';

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
});
