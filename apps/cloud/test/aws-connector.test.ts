import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComposioConnector } from '../src/aws.js';
import { COMPOSIO_TOOL_SLUGS, COMPOSIO_TOOL_VERSION } from '../src/connector-contract.js';
import type { ComposioConfig, SecretProvider } from '../src/ports.js';

const config: ComposioConfig = {
  apiKey: 'provider-secret-never-returned',
  baseUrl: 'https://backend.composio.test',
  authConfigIds: { gmail: 'gmail', google_drive: 'drive', slack: 'slack' },
  toolSlugs: { ...COMPOSIO_TOOL_SLUGS },
  toolVersion: COMPOSIO_TOOL_VERSION,
};

const secrets: SecretProvider = {
  meta: async () => {
    throw new Error('not used');
  },
  composio: async () => structuredClone(config),
};

describe('Composio connection lifecycle adapter', () => {
  it('deletes a never-authorized pending link after revoke reports a state conflict', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      calls.push({ method, url });
      if (method === 'POST' && url.endsWith('/revoke')) {
        return Response.json({}, { status: 409 });
      }
      if (method === 'GET') return Response.json({ status: 'INITIALIZING' });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await new ComposioConnector(secrets).disconnect('pending/account');

      assert.deepEqual(calls, [
        {
          method: 'POST',
          url: 'https://backend.composio.test/api/v3.1/connected_accounts/pending%2Faccount/revoke',
        },
        {
          method: 'GET',
          url: 'https://backend.composio.test/api/v3.1/connected_accounts/pending%2Faccount',
        },
        {
          method: 'DELETE',
          url: 'https://backend.composio.test/api/v3.1/connected_accounts/pending%2Faccount',
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('revokes an active account before deleting it', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(input) });
      return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({});
    }) as typeof fetch;

    try {
      await new ComposioConnector(secrets).disconnect('active-account');

      assert.deepEqual(
        calls.map(({ method }) => method),
        ['POST', 'DELETE'],
      );
      assert.equal(calls[0]?.url.endsWith('/active-account/revoke'), true);
      assert.equal(calls[1]?.url.endsWith('/active-account'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not delete when an active account revoke fails', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(input) });
      if (method === 'POST') return Response.json({}, { status: 409 });
      return Response.json({ status: 'ACTIVE' });
    }) as typeof fetch;

    try {
      await assert.rejects(
        new ComposioConnector(secrets).disconnect('active-account'),
        (error: unknown) =>
          error instanceof Error &&
          'code' in error &&
          error.code === 'connector_upstream_error',
      );
      assert.deepEqual(
        calls.map(({ method }) => method),
        ['POST', 'GET'],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps the provider INITIALIZING state to a pending link', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ status: 'INITIALIZING' })) as typeof fetch;

    try {
      assert.deepEqual(await new ComposioConnector(secrets).connectionStatus('pending'), {
        status: 'link_pending',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Composio file staging adapter', () => {
  it('uses the provider key only for the authenticated grant request', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      return Response.json({
        key: 'provider-private-object-key',
        new_presigned_url: 'https://provider-storage.test/object?signed=yes',
        type: 'new',
      });
    }) as typeof fetch;
    try {
      const grant = await new ComposioConnector(secrets).requestFileUpload(
        'drive.upload',
        'report.pdf',
        'application/pdf',
        'a'.repeat(32),
      );

      assert.deepEqual(grant, {
        providerKey: 'provider-private-object-key',
        uploadUrl: 'https://provider-storage.test/object?signed=yes',
      });
      assert.equal(
        calls[0]?.url,
        'https://backend.composio.test/api/v3.1/files/upload/request',
      );
      assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
        toolkit_slug: 'googledrive',
        tool_slug: 'GOOGLEDRIVE_UPLOAD_FILE',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        md5: 'a'.repeat(32),
      });
      assert.deepEqual(calls[0]?.init?.headers, {
        'content-type': 'application/json',
        'x-api-key': 'provider-secret-never-returned',
      });
      assert.equal(JSON.stringify(grant).includes(config.apiKey), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
