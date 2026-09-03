import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { S3Client } from '@aws-sdk/client-s3';

import { COMPOSIO_TOOL_SLUGS, COMPOSIO_TOOL_VERSIONS } from '../src/connector-contract.js';
import {
  GOOGLE_WORKSPACE_READ_SCOPES,
  GOOGLE_WORKSPACE_WRITE_SCOPES,
  GoogleWorkspaceConnector,
} from '../src/google-workspace.js';
import { FixedSecrets, MemoryState } from '../src/memory.js';
import { ConnectorReconnectRequiredError } from '../src/ports.js';
import type { ComposioConfig, MetaConfig, TokenCipher } from '../src/ports.js';

const meta: MetaConfig = {
  apiKey: 'test-meta-api-key-long-enough',
  endpoint: 'https://meta.example.test/v1',
  model: 'test-model',
  enabled: true,
};

const composio: ComposioConfig = {
  apiKey: 'test-composio-key-long-enough',
  baseUrl: 'https://composio.example.test',
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

class TestCipher implements TokenCipher {
  async encrypt(plaintext: string, context: Record<string, string>): Promise<string> {
    return `sealed.${Buffer.from(JSON.stringify(context)).toString('base64url')}.${Buffer.from(plaintext).toString('base64url')}`;
  }

  async decrypt(ciphertext: string, context: Record<string, string>): Promise<string> {
    const [prefix, encodedContext, encodedValue] = ciphertext.split('.');
    assert.equal(prefix, 'sealed');
    assert.deepEqual(JSON.parse(Buffer.from(encodedContext!, 'base64url').toString()), context);
    return Buffer.from(encodedValue!, 'base64url').toString();
  }
}

function connector(
  state: MemoryState,
  fetchImpl: typeof fetch,
  now = new Date('2026-08-24T00:00:00.000Z'),
): GoogleWorkspaceConnector {
  return new GoogleWorkspaceConnector({
    credentials: state,
    secrets: new FixedSecrets(meta, composio, {
      clientId: 'google-client-id.apps.googleusercontent.com',
      clientSecret: 'google-client-secret-long-enough',
      redirectUri: 'https://api.example.test/v1/oauth/google/callback',
    }),
    cipher: new TestCipher(),
    s3: new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
    stagingBucket: 'staging.example.test',
    fetchImpl,
    now: () => new Date(now),
  });
}

describe('unified Google Workspace OAuth', () => {
  it('creates a read-only PKCE grant by default and stores only sealed state', async () => {
    const state = new MemoryState();
    const google = connector(state, async () => {
      throw new Error('network should not be used while beginning OAuth');
    });

    const link = await google.beginConnection('user-1');
    const authorization = new URL(link.redirectUrl);

    assert.match(link.connectionId, /^gw_[A-Za-z0-9_-]+$/);
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(
      authorization.searchParams.get('client_id'),
      'google-client-id.apps.googleusercontent.com',
    );
    assert.equal(
      authorization.searchParams.get('redirect_uri'),
      'https://api.example.test/v1/oauth/google/callback',
    );
    assert.deepEqual(
      new Set(authorization.searchParams.get('scope')!.split(' ')),
      new Set(GOOGLE_WORKSPACE_READ_SCOPES),
    );
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.equal(state.googleOAuthStates.size, 1);
    const stored = [...state.googleOAuthStates.values()][0]!;
    assert.equal(stored.connectionId, link.connectionId);
    assert.match(stored.encryptedVerifier, /^sealed\./);
    assert.equal(stored.access, 'read_only');
    assert.equal(
      JSON.stringify(stored).includes(authorization.searchParams.get('state')!),
      false,
    );
  });

  it('requests editor scopes only for an explicit read-write connection', async () => {
    const state = new MemoryState();
    const google = connector(state, async () => {
      throw new Error('network should not be used while beginning OAuth');
    });

    const link = await google.beginConnection('user-writer', 'read_write');
    const authorization = new URL(link.redirectUrl);
    assert.deepEqual(
      new Set(authorization.searchParams.get('scope')!.split(' ')),
      new Set(GOOGLE_WORKSPACE_WRITE_SCOPES),
    );
    assert.equal([...state.googleOAuthStates.values()][0]?.access, 'read_write');
  });

  it('exchanges a single-use code, seals the refresh token, and serves multiple Google APIs', async () => {
    const state = new MemoryState();
    const calls: Array<{ url: string; authorization?: string }> = [];
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const authorization = headers.get('authorization') ?? undefined;
      calls.push({ url, ...(authorization === undefined ? {} : { authorization }) });
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = String(init?.body);
        if (body.includes('grant_type=authorization_code')) {
          return Response.json({
            access_token: 'access-one',
            refresh_token: 'refresh-token-must-stay-sealed',
            expires_in: 3600,
            // Google commonly returns the canonical userinfo scope for the requested OIDC
            // `email` alias. A complete Workspace grant must not be rejected for that rewrite.
            scope: GOOGLE_WORKSPACE_READ_SCOPES.map((scope) =>
              scope === 'email' ? 'https://www.googleapis.com/auth/userinfo.email' : scope,
            ).join(' '),
          });
        }
        return Response.json({ access_token: 'access-refreshed', expires_in: 3600 });
      }
      if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        return Response.json({ email: 'Person@Example.com' });
      }
      if (url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages')) {
        return Response.json({ messages: [{ id: 'message-1', threadId: 'thread-1' }] });
      }
      if (url.startsWith('https://docs.googleapis.com/v1/documents/document-1')) {
        return Response.json({
          documentId: 'document-1',
          title: 'Release notes',
          body: {
            content: [{ paragraph: { elements: [{ textRun: { content: 'Ready.\n' } }] } }],
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch;
    const google = connector(state, fetchImpl);
    const link = await google.beginConnection('user-1');
    const authorization = new URL(link.redirectUrl);
    const completed = await google.completeOAuth({
      state: authorization.searchParams.get('state')!,
      code: 'one-time-code',
    });

    assert.deepEqual(completed, {
      connectionId: link.connectionId,
      userId: 'user-1',
      connected: true,
      accountLabel: 'person@example.com',
    });
    assert.equal(state.googleOAuthStates.size, 0);
    const token = await state.getGoogleToken(link.connectionId);
    assert.ok(token);
    assert.equal(token.accountLabel, 'person@example.com');
    assert.match(token.encryptedRefreshToken, /^sealed\./);
    assert.equal(token.encryptedRefreshToken.includes('refresh-token-must-stay-sealed'), false);
    assert.deepEqual(await google.connectionStatus(link.connectionId), {
      status: 'connected',
      accountLabel: 'person@example.com',
      access: 'read_only',
    });

    const mail = await google.execute(
      'user-1',
      link.connectionId,
      'mail.search',
      { query: 'newer_than:1d', max_results: 5 },
      'execution-mail',
    );
    const docs = await google.execute(
      'user-1',
      link.connectionId,
      'docs.read',
      { document_id: 'document-1', include_tables: true, include_tabs_content: true },
      'execution-docs',
    );

    assert.deepEqual(mail.opaqueResourceIds, ['message-1']);
    assert.deepEqual(docs.data, {
      documentId: 'document-1',
      title: 'Release notes',
      text: 'Ready.\n',
      tabs: [],
    });
    await assert.rejects(
      google.validateAccess('user-1', link.connectionId, 'sheets.update'),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          'Enable Google editing and sending in Connected apps, then try again.',
    );
    assert.equal(
      calls.filter(({ authorization }) => authorization === 'Bearer access-one').length,
      3,
    );
    await assert.rejects(
      google.execute(
        'other-user',
        link.connectionId,
        'mail.search',
        { query: 'all', max_results: 1 },
        'wrong-user',
      ),
      ConnectorReconnectRequiredError,
    );
    await assert.rejects(
      google.completeOAuth({
        state: authorization.searchParams.get('state')!,
        code: 'replayed-code',
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'This Google connection link expired',
    );
  });

  it('consumes denied OAuth state without creating a token', async () => {
    const state = new MemoryState();
    const google = connector(state, async () => {
      throw new Error('denied OAuth must not call Google');
    });
    const link = await google.beginConnection('user-denied');
    const oauthState = new URL(link.redirectUrl).searchParams.get('state')!;

    assert.deepEqual(
      await google.completeOAuth({ state: oauthState, error: 'access_denied' }),
      {
        connectionId: link.connectionId,
        userId: 'user-denied',
        connected: false,
        failure: 'access_denied',
      },
    );
    assert.equal(await state.getGoogleToken(link.connectionId), undefined);
    assert.equal(state.googleOAuthStates.size, 0);
  });

  it('revokes a granular-consent grant when any required Workspace scope is missing', async () => {
    const state = new MemoryState();
    const calls: string[] = [];
    const grantedScopes = GOOGLE_WORKSPACE_WRITE_SCOPES.filter(
      (scope) => scope !== 'https://www.googleapis.com/auth/presentations',
    );
    const google = connector(state, (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({
          access_token: 'partial-access-token',
          refresh_token: 'partial-refresh-token',
          expires_in: 3600,
          scope: grantedScopes.join(' '),
        });
      }
      if (url.startsWith('https://oauth2.googleapis.com/revoke?token=')) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch);
    const link = await google.beginConnection('user-partial');
    const oauthState = new URL(link.redirectUrl).searchParams.get('state')!;

    assert.deepEqual(await google.completeOAuth({ state: oauthState, code: 'partial-code' }), {
      connectionId: link.connectionId,
      userId: 'user-partial',
      connected: false,
      failure: 'missing_scopes',
    });
    assert.equal(await state.getGoogleToken(link.connectionId), undefined);
    assert.equal(state.googleOAuthStates.size, 0);
    assert.ok(
      calls.includes('https://oauth2.googleapis.com/revoke?token=partial-refresh-token'),
    );
    assert.equal(
      calls.some((url) => url.includes('/oauth2/v3/userinfo')),
      false,
    );
  });

  it('retires a superseded credential locally without revoking its shared Google grant', async () => {
    const state = new MemoryState();
    const google = connector(state, async () => {
      throw new Error('retiring a superseded credential must not call Google');
    });
    const createdAt = '2026-08-24T00:00:00.000Z';
    await state.putGoogleToken({
      connectionId: 'gw_reader',
      userId: 'user-upgrade',
      encryptedRefreshToken: 'sealed-reader',
      accountLabel: 'person@example.com',
      grantedScopes: [...GOOGLE_WORKSPACE_READ_SCOPES],
      createdAt,
      updatedAt: createdAt,
    });
    await state.putGoogleToken({
      connectionId: 'gw_editor',
      userId: 'user-upgrade',
      encryptedRefreshToken: 'sealed-editor',
      accountLabel: 'person@example.com',
      grantedScopes: [...GOOGLE_WORKSPACE_WRITE_SCOPES],
      createdAt,
      updatedAt: createdAt,
    });

    await google.retireSuperseded('gw_reader');

    assert.equal(await state.getGoogleToken('gw_reader'), undefined);
    assert.ok(await state.getGoogleToken('gw_editor'));
    assert.deepEqual(await google.connectionStatus('gw_editor'), {
      status: 'connected',
      accountLabel: 'person@example.com',
      access: 'read_write',
    });
  });
});
