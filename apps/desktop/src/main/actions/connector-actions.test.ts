import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CloudRequestError } from '../cloud/cloud-client.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, request } from './test-support.js';
import type { CloudActionClient } from './types.js';

describe('DesktopActionBackend connector boundary', () => {
  it('offers browser continuation when an optional connector is not connected', async () => {
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud: {
        configured: true,
        prepareAction: vi.fn(),
        commitAction: vi.fn(),
      },
      resolveConnectionId: () => undefined,
    });

    const result = await backend.invoke(
      request('drive_search', { account_id: 'drive', query: 'budget', limit: 20 }),
    );

    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('Google Drive is not connected');
    expect(result.reason).toContain('https://drive.google.com');
    expect(result.reason).toContain('connect it later in Settings > Connections');
  });

  it('resolves stable account aliases to trusted cloud ids and strips account_id from input', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => ({
        status: 'executed' as const,
        executionId: 'execution-1',
        result: { threads: [{ id: 'opaque-1' }] },
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'connection-42' : undefined,
    });

    const result = await backend.invoke(
      request('drive_search', { account_id: 'drive', query: 'budget', limit: 20 }),
    );

    expect(result.outcome).toBe('verified');
    expect(cloud.prepareAction).toHaveBeenCalledWith(
      {
        connectionId: 'connection-42',
        tool: 'drive.search',
        input: { query: 'budget', limit: 20 },
      },
      undefined,
    );
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });

  it('marks an editor grant for reconnect when a read discovers expired authorization', async () => {
    const reconnect = vi.fn();
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => {
        throw new CloudRequestError(409, 'connection_reconnect_required', 'request-1');
      }),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-docs',
      onConnectionReconnectRequired: reconnect,
    });

    await expect(
      backend.invoke(request('docs_read', { account_id: 'docs', document_id: 'document-1' })),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('authorization expired'),
    });
    expect(reconnect).toHaveBeenCalledWith('docs', 'connection-docs');
  });

  it('marks an editor grant for reconnect when a mutation commit discovers expired authorization', async () => {
    const reconnect = vi.fn();
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-docs',
        digest: 'digest-docs',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => {
        throw new CloudRequestError(409, 'connection_reconnect_required', 'request-2');
      }),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-docs',
      onConnectionReconnectRequired: reconnect,
    });

    await expect(
      backend.invoke(
        request('docs_create', {
          account_id: 'docs',
          title: 'Fixture',
          markdown: 'read-back',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('authorization expired'),
    });
    expect(reconnect).toHaveBeenCalledWith('docs', 'connection-docs');
  });

  it.each([
    [
      'docs_read',
      'docs',
      'docs.read',
      { account_id: 'docs', document_id: 'document-1' },
      { document_id: 'document-1' },
    ],
    [
      'sheets_read',
      'sheets',
      'sheets.read',
      {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1:B20',
        start_row: 1,
        end_row: 20,
      },
      { spreadsheet_id: 'sheet-1', range: 'Sheet1!A1:B20', start_row: 1, end_row: 20 },
    ],
    [
      'slides_read',
      'slides',
      'slides.read',
      { account_id: 'slides', presentation_id: 'deck-1' },
      { presentation_id: 'deck-1' },
    ],
    [
      'slack_find_users',
      'slack',
      'slack.find_users',
      { account_id: 'slack', query: 'Lawrence Jang', limit: 10 },
      { query: 'Lawrence Jang', limit: 10 },
    ],
    [
      'slack_open_dm',
      'slack',
      'slack.open_dm',
      { account_id: 'slack', user_id: 'U012ABCDEF' },
      { user_id: 'U012ABCDEF' },
    ],
  ] as const)(
    'routes %s through its exact editor account',
    async (toolName, account, cloudTool, argumentsValue, cloudInput) => {
      const cloud: CloudActionClient = {
        configured: true,
        prepareAction: vi.fn(async () => ({
          status: 'executed' as const,
          executionId: 'execution-editor',
          result: { ok: true },
        })),
        commitAction: vi.fn(),
      };
      const backend = new DesktopActionBackend({
        cua: fakeCua(async () => ({})),
        cloud,
        resolveConnectionId: (app, selector) =>
          app === account && selector === account ? `connection-${account}` : undefined,
      });

      await expect(backend.invoke(request(toolName, argumentsValue))).resolves.toMatchObject({
        outcome: 'verified',
      });
      expect(cloud.prepareAction).toHaveBeenCalledWith(
        {
          connectionId: `connection-${account}`,
          tool: cloudTool,
          input: cloudInput,
        },
        undefined,
      );
    },
  );

  it('commits mutation input against the exact cloud digest', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => ({
        status: 'completed' as const,
        actionId: 'action-1',
        result: { message_id: 'opaque-message' },
      })),
    };
    const resolveConnectionId = vi.fn((app: string, selector: string) =>
      app === 'slack' && selector === 'slack' ? 'connection-9' : undefined,
    );
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId,
    });

    const result = await backend.invoke(
      request('slack_post', {
        account_id: 'slack',
        channel_id: 'team',
        text: 'Status is ready.',
      }),
    );

    expect(result.outcome).toBe('verified');
    expect(resolveConnectionId).toHaveBeenCalledWith('slack', 'slack', 'approval-1');
    expect(cloud.prepareAction).toHaveBeenCalledWith(
      {
        connectionId: 'connection-9',
        tool: 'slack.post',
        input: { channel_id: 'team', text: 'Status is ready.' },
      },
      undefined,
    );
    expect(cloud.commitAction).toHaveBeenCalledWith(
      {
        actionId: 'action-1',
        digest: 'digest-1',
        input: { channel_id: 'team', text: 'Status is ready.' },
      },
      undefined,
    );
  });

  it('refuses connector mutations that did not cross the host authorization boundary', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-9',
    });
    const { approvalId: _, ...unapproved } = request('slack_post', {
      account_id: 'slack',
      channel_id: 'team',
      text: 'Status is ready.',
    });

    await expect(backend.invoke(unapproved)).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('missing its exact action authorization'),
    });
    expect(cloud.prepareAction).not.toHaveBeenCalled();
  });

  it('refuses a connector mutation when the cloud preview omits or changes input', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: { channel_id: 'other-channel' },
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'slack' && selector === 'slack' ? 'connection-9' : undefined,
    });

    await expect(
      backend.invoke(
        request('slack_post', {
          account_id: 'slack',
          channel_id: 'team',
          text: 'Status is ready.',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('did not exactly match'),
    });
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });

  it('stages approved Drive bytes and sends no local path or raw bytes to action execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-drive-upload-'));
    const filePath = join(directory, 'report.txt');
    await writeFile(filePath, 'private report bytes');
    let stagedBytes: Buffer | undefined;
    const file = {
      uploadId: 'upload-opaque',
      fileName: 'renamed-report.txt',
      mimeType: 'text/plain',
      byteLength: Buffer.byteLength('private report bytes'),
      sha256: 'A'.repeat(43),
    };
    const cloud: CloudActionClient = {
      configured: true,
      stageConnectorFile: vi.fn(async (metadata, bytes) => {
        stagedBytes = Buffer.from(bytes);
        return { ...file, sha256: metadata.sha256 };
      }),
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => ({
        status: 'completed' as const,
        actionId: 'action-1',
        result: { file_id: 'opaque-file' },
      })),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'drive-connection' : undefined,
    });

    try {
      const result = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: filePath,
          parent_id: 'folder-1',
          name: 'renamed-report.txt',
        }),
      );

      expect(result.outcome).toBe('verified');
      expect(stagedBytes).toEqual(Buffer.from('private report bytes'));
      expect(cloud.stageConnectorFile).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'drive-connection',
          fileName: 'renamed-report.txt',
          mimeType: 'text/plain',
          byteLength: Buffer.byteLength('private report bytes'),
          md5: expect.stringMatching(/^[a-f0-9]{32}$/),
          sha256: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        }),
        expect.any(Uint8Array),
        undefined,
      );
      const prepareAction = cloud.prepareAction as ReturnType<typeof vi.fn>;
      const stagedDescriptor = dataRecord(prepareAction.mock.calls[0]?.[0]).input;
      expect(stagedDescriptor).toEqual({
        file: expect.objectContaining({
          uploadId: 'upload-opaque',
          fileName: 'renamed-report.txt',
          mimeType: 'text/plain',
        }),
        parent_id: 'folder-1',
      });
      expect(JSON.stringify(prepareAction.mock.calls)).not.toContain(filePath);
      expect(JSON.stringify(prepareAction.mock.calls)).not.toContain('private report bytes');
      expect(cloud.commitAction).toHaveBeenCalledWith(
        {
          actionId: 'action-1',
          digest: 'digest-1',
          input: stagedDescriptor,
        },
        undefined,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses unsupported and oversized Drive files before requesting a presigned URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-drive-bounds-'));
    const unsupportedPath = join(directory, 'payload.bin');
    const oversizedPath = join(directory, 'oversized.pdf');
    await writeFile(unsupportedPath, 'opaque');
    await writeFile(oversizedPath, 'x');
    await truncate(oversizedPath, 5_000_001);
    const cloud: CloudActionClient = {
      configured: true,
      stageConnectorFile: vi.fn(),
      prepareAction: vi.fn(),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'drive-connection' : undefined,
    });

    try {
      const unsupported = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: unsupportedPath,
        }),
      );
      const oversized = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: oversizedPath,
        }),
      );

      expect(unsupported.outcome).toBe('refused');
      expect(unsupported.reason).toMatch(/file type is not supported/);
      expect(oversized.outcome).toBe('refused');
      expect(oversized.reason).toMatch(/between 1 byte and 5000000 bytes/);
      expect(cloud.stageConnectorFile).not.toHaveBeenCalled();
      expect(cloud.prepareAction).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses connector calls when cloud is not configured', async () => {
    const backend = new DesktopActionBackend({ cua: fakeCua(async () => ({})) });
    const result = await backend.invoke(
      request('mail_search', { account_id: 'gmail', query: 'from:me', limit: 5 }),
    );
    expect(result.outcome).toBe('refused');
  });

  it('never commits when cloud turns a read-only connector request into a mutation', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'unexpected-action',
        digest: 'digest',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-1',
    });

    await expect(
      backend.invoke(request('mail_search', { account_id: 'gmail', query: 'status' })),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('read-only request into a mutation'),
    });
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });
});
