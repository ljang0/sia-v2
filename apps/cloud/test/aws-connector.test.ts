import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComposioConnector } from '../src/aws.js';
import { COMPOSIO_TOOL_SLUGS, COMPOSIO_TOOL_VERSIONS } from '../src/connector-contract.js';
import { ConnectorReconnectRequiredError } from '../src/ports.js';
import type { ComposioConfig, SecretProvider } from '../src/ports.js';

const config: ComposioConfig = {
  apiKey: 'provider-secret-never-returned',
  baseUrl: 'https://backend.composio.test',
  authConfigIds: {
    gmail: 'gmail',
    google_drive: 'drive',
    google_docs: 'docs',
    google_sheets: 'sheets',
    google_slides: 'slides',
    slack: 'slack',
  },
  toolSlugs: { ...COMPOSIO_TOOL_SLUGS },
  toolVersions: { ...COMPOSIO_TOOL_VERSIONS },
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

  it('does not trust a premature ACTIVE status while OAuth state is still initiated', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        status: 'ACTIVE',
        state: { val: { status: 'INITIATED' } },
        data: { status: 'INITIATED', redirectUrl: 'https://provider.test/authorize' },
      })) as typeof fetch;

    try {
      assert.deepEqual(await new ComposioConnector(secrets).connectionStatus('premature'), {
        status: 'link_pending',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts a consistently active OAuth connection and trims its account label', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        status: 'ACTIVE',
        state: { val: { status: 'ACTIVE' } },
        data: { status: 'CONNECTED' },
        account_display_name: '  user@example.test  ',
      })) as typeof fetch;

    try {
      assert.deepEqual(await new ComposioConnector(secrets).connectionStatus('active'), {
        status: 'connected',
        accountLabel: 'user@example.test',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails closed when a subordinate OAuth state reports failure', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        status: 'ACTIVE',
        state: { val: { status: 'FAILED' } },
      })) as typeof fetch;

    try {
      assert.deepEqual(await new ComposioConnector(secrets).connectionStatus('failed'), {
        status: 'failed',
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

describe('Composio tool execution adapter', () => {
  it('turns a gone provider grant into a reconnect-required error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({}, { status: 410 })) as typeof globalThis.fetch;
    try {
      await assert.rejects(
        new ComposioConnector(secrets).execute(
          'user-1',
          'stale-connection',
          'mail.search',
          { query: 'newer_than:7d', max_results: 1 },
          'execution-1',
        ),
        (error: unknown) => error instanceof ConnectorReconnectRequiredError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('turns a nested provider authentication failure into a reconnect-required error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        successful: false,
        error: {
          auth_refresh_required: false,
          mercury_last_http_status_code: 401,
          data: { status_code: 401 },
        },
      })) as typeof globalThis.fetch;
    try {
      await assert.rejects(
        new ComposioConnector(secrets).execute(
          'user-1',
          'expired-connection',
          'docs.create',
          { title: 'Fixture', markdown_text: 'read-back' },
          'execution-2',
        ),
        (error: unknown) => error instanceof ConnectorReconnectRequiredError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
