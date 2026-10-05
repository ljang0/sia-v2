import type { LocalConnectionId } from '../../shared/bridge.js';
import {
  type LocalCredential,
  type LocalCredentialStore,
  localConnectionApp,
  newLocalConnectionId,
} from './credential-store.js';
import type { LocalConnectorClients } from './clients.js';
import {
  GITHUB_DEVICE_CODE_URL,
  GITHUB_SCOPES,
  GITHUB_TOKEN_URL,
  githubAccount,
  runGithubTool,
} from './github.js';
import { ConnectorRequestError } from './http.js';
import {
  NOTION_MCP_URL,
  NOTION_OAUTH,
  NotionMcpClient,
  notionAccount,
  registerNotionClient,
  runNotionTool,
} from './notion.js';
import {
  type Fetch,
  OAuthError,
  type TokenResponse,
  loopbackAuthorization,
  pollDeviceAuthorization,
  requestToken,
  startDeviceAuthorization,
} from './oauth.js';
import {
  MICROSOFT_AUTHORITY,
  MICROSOFT_SCOPES,
  outlookAccount,
  runOutlookTool,
} from './outlook.js';

const REFRESH_MARGIN_MS = 2 * 60_000;

export interface LocalConnectResult {
  connectionId: string;
  account: string;
}

/**
 * Signs in to Outlook, Notion, and GitHub directly from this Mac and runs Sia's curated tools
 * against them. Tokens stay in the main process and the Keychain-encrypted credential store.
 */
export class LocalConnectorService {
  readonly #notion = new Map<string, NotionMcpClient>();

  constructor(
    private readonly options: {
      store: LocalCredentialStore;
      clients: LocalConnectorClients;
      openExternal(url: string): Promise<void>;
      fetch?: Fetch;
    },
  ) {}

  get #fetch(): Fetch {
    return this.options.fetch ?? fetch;
  }

  /** Whether this build can sign in to the app at all. */
  available(app: LocalConnectionId): boolean {
    if (app === 'notion') return true;
    return Boolean(this.options.clients[app === 'outlook' ? 'microsoft' : 'github']);
  }

  async connect(
    app: LocalConnectionId,
    options: { signal?: AbortSignal; onUserCode?(code: string, url: string): void } = {},
  ): Promise<LocalConnectResult> {
    if (!this.available(app)) {
      throw new Error(`${appLabel(app)} isn’t available in this version of Sia yet.`);
    }
    const connectionId = newLocalConnectionId(app);
    const { token, clientId } =
      app === 'outlook'
        ? await this.#signInMicrosoft(options.signal)
        : app === 'github'
          ? await this.#signInGithub(options.signal, options.onUserCode)
          : await this.#signInNotion(options.signal);
    const credential: LocalCredential = {
      app,
      clientId,
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
      account: '',
    };
    this.options.store.save(connectionId, credential);
    try {
      const account = await this.#account(app, connectionId, credential.accessToken);
      this.options.store.save(connectionId, { ...credential, account });
      return { connectionId, account };
    } catch (error) {
      this.forget(connectionId);
      throw error;
    }
  }

  /** The account label saved with a connection, or undefined when its sign-in is gone. */
  savedAccount(connectionId: string): string | undefined {
    try {
      return this.options.store.read(connectionId)?.account || undefined;
    } catch {
      return undefined;
    }
  }

  /** Removes every saved sign-in on this Mac, for account deletion. */
  forgetAll(): void {
    this.#notion.clear();
    this.options.store.clear();
  }

  /** Removes this Mac's saved tokens. Provider-side app access stays listed in the account's own settings. */
  forget(connectionId: string): void {
    this.#notion.delete(connectionId);
    if (localConnectionApp(connectionId)) this.options.store.remove(connectionId);
  }

  async execute(
    app: LocalConnectionId,
    connectionId: string,
    tool: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (localConnectionApp(connectionId) !== app) {
      throw new ConnectorRequestError(400, 'That connection belongs to a different app.');
    }
    if (app === 'notion') {
      return runNotionTool(this.#notionClient(connectionId), tool, input, signal);
    }
    const token = await this.#accessToken(connectionId, signal);
    return app === 'outlook'
      ? runOutlookTool(this.#fetch, token, tool, input, signal)
      : runGithubTool(this.#fetch, token, tool, input, signal);
  }

  #notionClient(connectionId: string): NotionMcpClient {
    let client = this.#notion.get(connectionId);
    if (!client) {
      client = new NotionMcpClient(this.#fetch, () => this.#accessToken(connectionId));
      this.#notion.set(connectionId, client);
    }
    return client;
  }

  async #account(app: LocalConnectionId, connectionId: string, token: string): Promise<string> {
    if (app === 'outlook') return outlookAccount(this.#fetch, token);
    if (app === 'github') return githubAccount(this.#fetch, token);
    return notionAccount(this.#notionClient(connectionId));
  }

  async #accessToken(connectionId: string, signal?: AbortSignal): Promise<string> {
    const credential = this.options.store.read(connectionId);
    if (!credential) {
      throw new ConnectorRequestError(
        401,
        'This app is no longer connected. Reconnect it in Settings > Connections.',
      );
    }
    if (!credential.expiresAt || credential.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return credential.accessToken;
    }
    if (!credential.refreshToken) {
      throw new ConnectorRequestError(
        401,
        'This app connection expired. Reconnect it in Settings > Connections.',
      );
    }
    const base = {
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken,
      client_id: credential.clientId,
    };
    // Each refresh token goes only to the provider that issued it.
    const [endpoint, form] =
      credential.app === 'outlook'
        ? [`${MICROSOFT_AUTHORITY}/token`, { ...base, scope: MICROSOFT_SCOPES.join(' ') }]
        : credential.app === 'notion'
          ? [NOTION_OAUTH.token, { ...base, resource: NOTION_MCP_URL }]
          : credential.app === 'github'
            ? [GITHUB_TOKEN_URL, base]
            : [undefined, base];
    if (!endpoint) {
      throw new ConnectorRequestError(
        401,
        'This app connection expired. Reconnect it in Settings > Connections.',
      );
    }
    let refreshed: TokenResponse;
    try {
      refreshed = await requestToken(this.#fetch, endpoint, form, signal);
    } catch (error) {
      if (error instanceof OAuthError && error.code === 'invalid_grant') {
        throw new ConnectorRequestError(401, error.message);
      }
      throw error;
    }
    this.options.store.save(connectionId, {
      ...credential,
      accessToken: refreshed.accessToken,
      // Providers that rotate refresh tokens return a new one; others keep the original.
      refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      ...(refreshed.expiresAt ? { expiresAt: refreshed.expiresAt } : {}),
    });
    return refreshed.accessToken;
  }

  async #signInMicrosoft(
    signal?: AbortSignal,
  ): Promise<{ token: TokenResponse; clientId: string }> {
    const clientId = this.options.clients.microsoft!;
    const scope = MICROSOFT_SCOPES.join(' ');
    const { code, redirectUri, verifier } = await loopbackAuthorization({
      redirectHost: 'localhost',
      openExternal: this.options.openExternal,
      ...(signal ? { signal } : {}),
      authorizationUrl: ({ redirectUri, state, challenge }) => {
        const url = new URL(`${MICROSOFT_AUTHORITY}/authorize`);
        url.search = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          response_mode: 'query',
          scope,
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          prompt: 'select_account',
        }).toString();
        return url;
      },
    });
    const token = await requestToken(
      this.#fetch,
      `${MICROSOFT_AUTHORITY}/token`,
      {
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope,
      },
      signal,
    );
    return { token, clientId };
  }

  async #signInGithub(
    signal?: AbortSignal,
    onUserCode?: (code: string, url: string) => void,
  ): Promise<{ token: TokenResponse; clientId: string }> {
    const clientId = this.options.clients.github!;
    const device = await startDeviceAuthorization(
      this.#fetch,
      GITHUB_DEVICE_CODE_URL,
      { client_id: clientId, scope: GITHUB_SCOPES.join(' ') },
      signal,
    );
    const url = new URL(device.verificationUri);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      throw new Error('GitHub returned an unexpected sign-in page.');
    }
    onUserCode?.(device.userCode, url.toString());
    await this.options.openExternal(url.toString());
    const token = await pollDeviceAuthorization(
      this.#fetch,
      GITHUB_TOKEN_URL,
      { client_id: clientId },
      device,
      signal,
    );
    return { token, clientId };
  }

  async #signInNotion(
    signal?: AbortSignal,
  ): Promise<{ token: TokenResponse; clientId: string }> {
    let clientId = '';
    const { code, redirectUri, verifier } = await loopbackAuthorization({
      redirectHost: '127.0.0.1',
      openExternal: this.options.openExternal,
      ...(signal ? { signal } : {}),
      authorizationUrl: async ({ redirectUri, state, challenge }) => {
        clientId = await registerNotionClient(this.#fetch, redirectUri, signal);
        const url = new URL(NOTION_OAUTH.authorize);
        url.search = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          resource: NOTION_MCP_URL,
        }).toString();
        return url;
      },
    });
    const token = await requestToken(
      this.#fetch,
      NOTION_OAUTH.token,
      {
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: NOTION_MCP_URL,
      },
      signal,
    );
    return { token, clientId };
  }
}

export function appLabel(app: LocalConnectionId): string {
  return { outlook: 'Outlook', notion: 'Notion', github: 'GitHub' }[app];
}
