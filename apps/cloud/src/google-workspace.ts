import { createHash, randomBytes } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { AppId, ToolName } from './contracts.js';
import { CloudError, isRecord } from './domain.js';
import { ConnectorReconnectRequiredError } from './ports.js';
import type {
  ConnectorExecution,
  ConnectorFileUploadGrant,
  ConnectorLink,
  ConnectorProvider,
  ConnectorStatus,
  GoogleCredentialRepository,
  SecretProvider,
  TokenCipher,
} from './ports.js';

const GOOGLE_CONNECTION_PREFIX = 'gw_';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const MAX_GOOGLE_RESPONSE_BYTES = 10 * 1024 * 1024;
const GOOGLE_API_ORIGINS = new Set([
  'https://gmail.googleapis.com',
  'https://www.googleapis.com',
  'https://docs.googleapis.com',
  'https://sheets.googleapis.com',
  'https://slides.googleapis.com',
]);

/**
 * One deliberately fixed grant powers the Google Workspace surface. Read scopes
 * cover existing resources; drive.file limits writes to files a user creates or
 * explicitly opens with Sia. Changing this list requires a new consent review.
 */
export const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
] as const;

interface AccessTokenCacheEntry {
  token: string;
  expiresAt: number;
}

interface GoogleWorkspaceConnectorOptions {
  credentials: GoogleCredentialRepository;
  secrets: SecretProvider;
  cipher: TokenCipher;
  s3: S3Client;
  stagingBucket: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class GoogleWorkspaceConnector {
  readonly #credentials: GoogleCredentialRepository;
  readonly #secrets: SecretProvider;
  readonly #cipher: TokenCipher;
  readonly #s3: S3Client;
  readonly #stagingBucket: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #accessTokens = new Map<string, AccessTokenCacheEntry>();

  constructor(options: GoogleWorkspaceConnectorOptions) {
    this.#credentials = options.credentials;
    this.#secrets = options.secrets;
    this.#cipher = options.cipher;
    this.#s3 = options.s3;
    this.#stagingBucket = options.stagingBucket;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  owns(connectionId: string): boolean {
    return connectionId.startsWith(GOOGLE_CONNECTION_PREFIX);
  }

  async beginConnection(userId: string): Promise<ConnectorLink> {
    const config = await this.#secrets.google();
    const connectionId = `${GOOGLE_CONNECTION_PREFIX}${randomBytes(18).toString('base64url')}`;
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const stateHash = sha256(state);
    const expiresAt = Math.floor(this.#now().getTime() / 1000) + OAUTH_STATE_TTL_SECONDS;
    const context = oauthStateContext(connectionId, userId);
    await this.#credentials.putGoogleOAuthState({
      stateHash,
      userId,
      connectionId,
      encryptedVerifier: await this.#cipher.encrypt(verifier, context),
      expiresAt,
    });

    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
      state,
      code_challenge: sha256(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return {
      connectionId,
      redirectUrl: authorization.toString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async completeOAuth(request: { state: string; code?: string; error?: string }): Promise<{
    connectionId: string;
    userId: string;
    connected: boolean;
    accountLabel?: string;
  }> {
    const stateRecord = await this.#credentials.consumeGoogleOAuthState(sha256(request.state));
    if (!stateRecord || stateRecord.expiresAt <= Math.floor(this.#now().getTime() / 1000)) {
      throw new CloudError(400, 'oauth_state_invalid', 'This Google connection link expired');
    }
    if (request.error || !request.code) {
      return {
        connectionId: stateRecord.connectionId,
        userId: stateRecord.userId,
        connected: false,
      };
    }

    const config = await this.#secrets.google();
    const verifier = await this.#cipher.decrypt(
      stateRecord.encryptedVerifier,
      oauthStateContext(stateRecord.connectionId, stateRecord.userId),
    );
    const tokenResponse = await this.#fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: request.code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenBody = await boundedJson(tokenResponse, MAX_GOOGLE_RESPONSE_BYTES);
    if (!tokenResponse.ok) {
      throw new CloudError(
        502,
        'google_oauth_exchange_failed',
        'Google authorization failed',
        true,
      );
    }
    const accessToken = requiredStringField(tokenBody, 'access_token');
    const refreshToken = requiredStringField(tokenBody, 'refresh_token');
    const scopes = optionalStringField(tokenBody, 'scope')?.split(/\s+/).filter(Boolean) ?? [];
    assertRequiredScopes(scopes);

    const profile = await this.#googleJson(
      accessToken,
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { method: 'GET' },
    );
    const accountLabel = requiredStringField(profile, 'email').trim().toLowerCase();
    const now = this.#now().toISOString();
    await this.#credentials.putGoogleToken({
      connectionId: stateRecord.connectionId,
      userId: stateRecord.userId,
      encryptedRefreshToken: await this.#cipher.encrypt(
        refreshToken,
        tokenContext(stateRecord.connectionId, stateRecord.userId),
      ),
      accountLabel,
      grantedScopes: scopes,
      createdAt: now,
      updatedAt: now,
    });
    this.#cacheAccessToken(stateRecord.connectionId, accessToken, tokenBody.expires_in);
    return {
      connectionId: stateRecord.connectionId,
      userId: stateRecord.userId,
      connected: true,
      accountLabel,
    };
  }

  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    const token = await this.#credentials.getGoogleToken(connectionId);
    return token
      ? { status: 'connected', accountLabel: token.accountLabel }
      : { status: 'link_pending' };
  }

  async disconnect(connectionId: string): Promise<void> {
    const token = await this.#credentials.getGoogleToken(connectionId);
    this.#accessTokens.delete(connectionId);
    if (!token) return;
    try {
      const refreshToken = await this.#cipher.decrypt(
        token.encryptedRefreshToken,
        tokenContext(connectionId, token.userId),
      );
      await this.#fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } finally {
      await this.#credentials.deleteGoogleToken(connectionId);
    }
  }

  async requestFileUpload(
    connectionId: string,
    fileName: string,
    mimeType: string,
  ): Promise<ConnectorFileUploadGrant> {
    const key = `connector-staging/${sha256(connectionId)}/${randomBytes(18).toString('base64url')}`;
    const uploadUrl = await getSignedUrl(
      this.#s3,
      new PutObjectCommand({
        Bucket: this.#stagingBucket,
        Key: key,
        ContentType: mimeType,
        Metadata: { filename: Buffer.from(fileName).toString('base64url') },
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { providerKey: key, uploadUrl };
  }

  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    const tokenRecord = await this.#credentials.getGoogleToken(connectionId);
    if (!tokenRecord || tokenRecord.userId !== userId)
      throw new ConnectorReconnectRequiredError();
    const accessToken = await this.#accessToken(tokenRecord);
    const result = await this.#executeTool(accessToken, tool, input, idempotencyKey);
    return {
      data: result.data,
      ...(result.opaqueResourceIds.length
        ? { opaqueResourceIds: result.opaqueResourceIds }
        : {}),
    };
  }

  async #accessToken(
    token: Awaited<ReturnType<GoogleCredentialRepository['getGoogleToken']>> & {},
  ): Promise<string> {
    const cached = this.#accessTokens.get(token.connectionId);
    if (cached && cached.expiresAt > this.#now().getTime() + 60_000) return cached.token;
    const config = await this.#secrets.google();
    const refreshToken = await this.#cipher.decrypt(
      token.encryptedRefreshToken,
      tokenContext(token.connectionId, token.userId),
    );
    const response = await this.#fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await boundedJson(response, MAX_GOOGLE_RESPONSE_BYTES);
    if (!response.ok) {
      const error = optionalStringField(body, 'error');
      if (error === 'invalid_grant' || response.status === 401) {
        throw new ConnectorReconnectRequiredError();
      }
      throw new CloudError(
        502,
        'google_token_refresh_failed',
        'Google authorization failed',
        true,
      );
    }
    const accessToken = requiredStringField(body, 'access_token');
    this.#cacheAccessToken(token.connectionId, accessToken, body.expires_in);
    return accessToken;
  }

  #cacheAccessToken(connectionId: string, accessToken: string, expiresIn: unknown): void {
    const seconds =
      typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? expiresIn : 3600;
    this.#accessTokens.set(connectionId, {
      token: accessToken,
      expiresAt: this.#now().getTime() + Math.max(60, seconds) * 1000,
    });
  }

  async #executeTool(
    accessToken: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ data: unknown; opaqueResourceIds: string[] }> {
    switch (tool) {
      case 'mail.search': {
        const url = googleUrl('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
          q: stringInput(input, 'query'),
          maxResults: numberInput(input, 'max_results'),
        });
        const data = await this.#googleJson(accessToken, url, { method: 'GET' });
        return { data, opaqueResourceIds: idsFromArray(data.messages) };
      }
      case 'mail.read_thread': {
        const id = stringInput(input, 'thread_id');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}`,
            {
              format: 'full',
            },
          ),
          { method: 'GET' },
        );
        return { data, opaqueResourceIds: [id] };
      }
      case 'mail.create_draft':
      case 'mail.send': {
        const raw = gmailRawMessage(input);
        const path =
          tool === 'mail.create_draft'
            ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
            : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
        const message = {
          raw,
          ...(typeof input.thread_id === 'string' ? { threadId: input.thread_id } : {}),
        };
        const data = await this.#googleJson(accessToken, path, {
          method: 'POST',
          body: JSON.stringify(tool === 'mail.create_draft' ? { message } : message),
        });
        return { data, opaqueResourceIds: recordId(data) };
      }
      case 'drive.search': {
        const data = await this.#googleJson(
          accessToken,
          googleUrl('https://www.googleapis.com/drive/v3/files', {
            q: stringInput(input, 'q'),
            pageSize: numberInput(input, 'pageSize'),
            fields:
              'files(id,name,mimeType,modifiedTime,createdTime,webViewLink,parents,owners(displayName,emailAddress)),nextPageToken',
          }),
          { method: 'GET' },
        );
        return { data, opaqueResourceIds: idsFromArray(data.files) };
      }
      case 'drive.read': {
        const id = stringInput(input, 'fileId');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
            fields:
              'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,owners(displayName,emailAddress),capabilities',
          }),
          { method: 'GET' },
        );
        return { data, opaqueResourceIds: [id] };
      }
      case 'drive.share': {
        const id = stringInput(input, 'file_id');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`,
            {
              sendNotificationEmail: Boolean(input.send_notification_email),
              fields: 'id,type,role,emailAddress',
            },
          ),
          {
            method: 'POST',
            body: JSON.stringify({
              type: stringInput(input, 'type'),
              role: stringInput(input, 'role'),
              emailAddress: stringInput(input, 'email_address'),
            }),
          },
        );
        return { data, opaqueResourceIds: [id, ...recordId(data)] };
      }
      case 'drive.upload':
        return await this.#uploadDriveFile(accessToken, input);
      case 'docs.create': {
        const created = await this.#googleJson(
          accessToken,
          'https://docs.googleapis.com/v1/documents',
          {
            method: 'POST',
            body: JSON.stringify({ title: stringInput(input, 'title') }),
          },
        );
        const documentId = requiredStringField(created, 'documentId');
        const text = markdownToPlainText(stringInput(input, 'markdown_text'));
        if (text) {
          await this.#googleJson(
            accessToken,
            `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
            {
              method: 'POST',
              body: JSON.stringify({
                requests: [{ insertText: { location: { index: 1 }, text } }],
              }),
            },
          );
        }
        return {
          data: { ...created, textInserted: text.length },
          opaqueResourceIds: [documentId],
        };
      }
      case 'docs.read': {
        const documentId = stringInput(input, 'document_id');
        const document = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
            {
              includeTabsContent: true,
            },
          ),
          { method: 'GET' },
        );
        return {
          data: {
            documentId,
            title: document.title,
            text: extractDocumentText(document),
            tabs: extractDocumentTabs(document),
          },
          opaqueResourceIds: [documentId],
        };
      }
      case 'docs.append': {
        const documentId = stringInput(input, 'document_id');
        const document = await this.#googleJson(
          accessToken,
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
          { method: 'GET' },
        );
        const index = Math.max(1, documentEndIndex(document) - 1);
        const data = await this.#googleJson(
          accessToken,
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
          {
            method: 'POST',
            body: JSON.stringify({
              requests: [
                {
                  insertText: {
                    location: { index },
                    text: stringInput(input, 'text_to_insert'),
                  },
                },
              ],
            }),
          },
        );
        return { data, opaqueResourceIds: [documentId] };
      }
      case 'sheets.create': {
        const data = await this.#googleJson(
          accessToken,
          'https://sheets.googleapis.com/v4/spreadsheets',
          {
            method: 'POST',
            body: JSON.stringify({ properties: { title: stringInput(input, 'title') } }),
          },
        );
        const spreadsheetId = requiredStringField(data, 'spreadsheetId');
        if (typeof input.folder_id === 'string') {
          await this.#googleJson(
            accessToken,
            googleUrl(
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`,
              {
                addParents: input.folder_id,
                fields: 'id,parents',
              },
            ),
            { method: 'PATCH', body: '{}' },
          );
        }
        return { data, opaqueResourceIds: [spreadsheetId] };
      }
      case 'sheets.read': {
        const spreadsheetId = stringInput(input, 'spreadsheet_id');
        const range = stringInput(input, 'range');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
            {
              majorDimension: stringInput(input, 'major_dimension'),
              valueRenderOption: stringInput(input, 'value_render_option'),
              dateTimeRenderOption: stringInput(input, 'date_time_render_option'),
            },
          ),
          { method: 'GET' },
        );
        return { data, opaqueResourceIds: [spreadsheetId] };
      }
      case 'sheets.update': {
        const spreadsheetId = stringInput(input, 'spreadsheet_id');
        const range = stringInput(input, 'range');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
            {
              valueInputOption: stringInput(input, 'value_input_option'),
              includeValuesInResponse: Boolean(input.include_values_in_response),
            },
          ),
          {
            method: 'PUT',
            body: JSON.stringify({ range, majorDimension: 'ROWS', values: input.values }),
          },
        );
        return { data, opaqueResourceIds: [spreadsheetId] };
      }
      case 'sheets.append': {
        const spreadsheetId = stringInput(input, 'spreadsheetId');
        const range = stringInput(input, 'range');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
            {
              valueInputOption: stringInput(input, 'valueInputOption'),
              insertDataOption: stringInput(input, 'insertDataOption'),
              includeValuesInResponse: Boolean(input.includeValuesInResponse),
            },
          ),
          {
            method: 'POST',
            body: JSON.stringify({ range, majorDimension: 'ROWS', values: input.values }),
          },
        );
        return { data, opaqueResourceIds: [spreadsheetId] };
      }
      case 'slides.create': {
        const created = await this.#googleJson(
          accessToken,
          'https://slides.googleapis.com/v1/presentations',
          {
            method: 'POST',
            body: JSON.stringify({ title: stringInput(input, 'title') }),
          },
        );
        const presentationId = requiredStringField(created, 'presentationId');
        const existingSlides = idsFromArray(created.slides);
        const data = await this.#writeSlides(
          accessToken,
          presentationId,
          stringInput(input, 'markdown_text'),
          idempotencyKey,
          existingSlides,
        );
        return { data: { ...created, update: data }, opaqueResourceIds: [presentationId] };
      }
      case 'slides.read': {
        const presentationId = stringInput(input, 'presentationId');
        const data = await this.#googleJson(
          accessToken,
          googleUrl(
            `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`,
            {
              fields: stringInput(input, 'fields'),
            },
          ),
          { method: 'GET' },
        );
        return { data, opaqueResourceIds: [presentationId, ...idsFromArray(data.slides)] };
      }
      case 'slides.append': {
        const presentationId = stringInput(input, 'presentationId');
        const data = await this.#writeSlides(
          accessToken,
          presentationId,
          stringInput(input, 'markdown_text'),
          idempotencyKey,
          [],
        );
        return { data, opaqueResourceIds: [presentationId] };
      }
      default:
        throw new CloudError(
          400,
          'tool_connection_mismatch',
          'That tool is not a Google Workspace action',
        );
    }
  }

  async #uploadDriveFile(
    accessToken: string,
    input: Record<string, unknown>,
  ): Promise<{ data: unknown; opaqueResourceIds: string[] }> {
    const file = input.file_to_upload;
    if (!isRecord(file))
      throw new CloudError(400, 'invalid_drive_upload', 'Staged file is invalid');
    const key = stringInput(file, 's3key');
    const mimeType = stringInput(file, 'mimetype');
    const name = stringInput(file, 'name');
    const object = await this.#s3.send(
      new GetObjectCommand({ Bucket: this.#stagingBucket, Key: key }),
    );
    if (!object.Body)
      throw new CloudError(410, 'connector_upload_expired', 'The staged file expired');
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const expectedLength = numberInput(file, 'byte_length');
    const expectedMd5 = stringInput(file, 'md5');
    const expectedSha256 = stringInput(file, 'sha256');
    if (
      bytes.byteLength !== expectedLength ||
      createHash('md5').update(bytes).digest('hex') !== expectedMd5 ||
      createHash('sha256').update(bytes).digest('base64url') !== expectedSha256
    ) {
      bytes.fill(0);
      await this.#s3
        .send(new DeleteObjectCommand({ Bucket: this.#stagingBucket, Key: key }))
        .catch(() => undefined);
      throw new CloudError(409, 'connector_upload_mismatch', 'The staged file bytes changed');
    }
    const boundary = `sia_${randomBytes(18).toString('hex')}`;
    const metadata = JSON.stringify({
      name,
      ...(typeof input.folder_to_upload_to === 'string'
        ? { parents: [input.folder_to_upload_to] }
        : {}),
    });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    try {
      const data = await this.#googleJson(
        accessToken,
        googleUrl('https://www.googleapis.com/upload/drive/v3/files', {
          uploadType: 'multipart',
          fields: 'id,name,mimeType,size,webViewLink,parents',
        }),
        {
          method: 'POST',
          headers: { 'content-type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      return { data, opaqueResourceIds: recordId(data) };
    } finally {
      bytes.fill(0);
      body.fill(0);
      await this.#s3
        .send(new DeleteObjectCommand({ Bucket: this.#stagingBucket, Key: key }))
        .catch(() => undefined);
    }
  }

  async #writeSlides(
    accessToken: string,
    presentationId: string,
    markdown: string,
    idempotencyKey: string,
    deleteSlideIds: string[],
  ): Promise<Record<string, unknown>> {
    const slides = parseSlides(markdown);
    const seed = sha256(`${presentationId}:${idempotencyKey}`).slice(0, 18);
    const requests: Record<string, unknown>[] = deleteSlideIds.map((objectId) => ({
      deleteObject: { objectId },
    }));
    for (const [index, slide] of slides.entries()) {
      const suffix = `${seed}_${index}`;
      const slideId = `sia_slide_${suffix}`;
      const titleId = `sia_title_${suffix}`;
      const bodyId = `sia_body_${suffix}`;
      requests.push({
        createSlide: {
          objectId: slideId,
          slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
          placeholderIdMappings: [
            { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleId },
            { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId },
          ],
        },
      });
      requests.push({ insertText: { objectId: titleId, text: slide.title } });
      if (slide.body) requests.push({ insertText: { objectId: bodyId, text: slide.body } });
    }
    return await this.#googleJson(
      accessToken,
      `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests }) },
    );
  }

  async #googleJson(
    accessToken: string,
    endpoint: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      !GOOGLE_API_ORIGINS.has(url.origin) ||
      url.username ||
      url.password
    ) {
      throw new CloudError(
        500,
        'google_endpoint_invalid',
        'Google endpoint is not allowlisted',
      );
    }
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type'))
      headers.set('content-type', 'application/json');
    const response = await this.#fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(25_000),
    });
    const body = await boundedJson(response, MAX_GOOGLE_RESPONSE_BYTES);
    if (!response.ok) {
      if (response.status === 401) throw new ConnectorReconnectRequiredError();
      throw new CloudError(
        response.status === 403 ? 403 : 502,
        response.status === 403 ? 'google_permission_denied' : 'google_api_failed',
        response.status === 403
          ? 'Google did not grant access to that resource'
          : 'Google Workspace action failed',
        response.status >= 500,
      );
    }
    return body;
  }
}

export class HybridConnector implements ConnectorProvider {
  constructor(
    private readonly google: GoogleWorkspaceConnector,
    private readonly composio: ConnectorProvider,
  ) {}

  async beginConnection(
    userId: string,
    app: AppId,
    callbackUrl?: string,
  ): Promise<ConnectorLink> {
    return app === 'google_workspace'
      ? this.google.beginConnection(userId)
      : this.composio.beginConnection(userId, app, callbackUrl);
  }

  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    return this.google.owns(connectionId)
      ? this.google.connectionStatus(connectionId)
      : this.composio.connectionStatus(connectionId);
  }

  async disconnect(connectionId: string): Promise<void> {
    return this.google.owns(connectionId)
      ? this.google.disconnect(connectionId)
      : this.composio.disconnect(connectionId);
  }

  async requestFileUpload(
    connectionId: string,
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant> {
    return this.google.owns(connectionId)
      ? this.google.requestFileUpload(connectionId, fileName, mimeType)
      : this.composio.requestFileUpload(connectionId, tool, fileName, mimeType, md5);
  }

  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    return this.google.owns(connectionId)
      ? this.google.execute(userId, connectionId, tool, input, idempotencyKey)
      : this.composio.execute(userId, connectionId, tool, input, idempotencyKey);
  }

  async completeGoogleOAuth(request: {
    state: string;
    code?: string;
    error?: string;
  }): Promise<{
    connectionId: string;
    userId: string;
    connected: boolean;
    accountLabel?: string;
  }> {
    return this.google.completeOAuth(request);
  }
}

function oauthStateContext(connectionId: string, userId: string): Record<string, string> {
  return { purpose: 'google-oauth-state', connectionId, userId };
}

function tokenContext(connectionId: string, userId: string): Record<string, string> {
  return { purpose: 'google-refresh-token', connectionId, userId };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function assertRequiredScopes(scopes: string[]): void {
  const granted = new Set(scopes);
  const missing = GOOGLE_WORKSPACE_SCOPES.filter((scope) => !granted.has(scope));
  if (missing.length) {
    throw new CloudError(
      409,
      'google_scope_missing',
      'Google did not grant every selected Workspace permission',
    );
  }
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximumBytes) {
    throw new CloudError(
      502,
      'google_response_too_large',
      'Google response exceeded the safe limit',
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new CloudError(
      502,
      'google_response_too_large',
      'Google response exceeded the safe limit',
    );
  }
  if (bytes.byteLength === 0) return {};
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : { data: value };
  } catch {
    throw new CloudError(
      502,
      'google_response_invalid',
      'Google returned an invalid response',
      true,
    );
  }
}

function requiredStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudError(
      502,
      'google_response_invalid',
      'Google returned an incomplete response',
    );
  }
  return value;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function stringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string')
    throw new CloudError(400, 'invalid_connector_input', `${key} is invalid`);
  return value;
}

function numberInput(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CloudError(400, 'invalid_connector_input', `${key} is invalid`);
  }
  return value;
}

function googleUrl(
  endpoint: string,
  parameters: Record<string, string | number | boolean>,
): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, String(value));
  return url.toString();
}

function gmailRawMessage(input: Record<string, unknown>): string {
  const recipient = stringInput(input, 'recipient_email');
  const extra = Array.isArray(input.extra_recipients)
    ? input.extra_recipients.filter((value): value is string => typeof value === 'string')
    : [];
  const cc = Array.isArray(input.cc)
    ? input.cc.filter((value): value is string => typeof value === 'string')
    : [];
  const subject = stringInput(input, 'subject');
  if (/\r|\n/.test(subject))
    throw new CloudError(400, 'invalid_connector_input', 'subject is invalid');
  const encodedSubject = /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const headers = [
    `To: ${[recipient, ...extra].join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${stringInput(input, 'body')}`).toString(
    'base64url',
  );
}

function recordId(record: Record<string, unknown>): string[] {
  return typeof record.id === 'string' ? [record.id] : [];
}

function idsFromArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) =>
        isRecord(entry) && typeof entry.id === 'string'
          ? [entry.id]
          : isRecord(entry) && typeof entry.objectId === 'string'
            ? [entry.objectId]
            : [],
      )
    : [];
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();
}

function extractDocumentText(document: Record<string, unknown>): string {
  const fragments: string[] = [];
  collectText(document.body, fragments);
  if (Array.isArray(document.tabs)) {
    for (const tab of document.tabs) if (isRecord(tab)) collectText(tab.documentTab, fragments);
  }
  return fragments.join('');
}

function extractDocumentTabs(document: Record<string, unknown>): unknown[] {
  if (!Array.isArray(document.tabs)) return [];
  return document.tabs.flatMap((tab) => {
    if (!isRecord(tab)) return [];
    const properties = isRecord(tab.tabProperties) ? tab.tabProperties : {};
    const fragments: string[] = [];
    collectText(tab.documentTab, fragments);
    return [{ tabId: properties.tabId, title: properties.title, text: fragments.join('') }];
  });
}

function collectText(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return;
  }
  if (!isRecord(value)) return;
  const textContent = typeof value.content === 'string';
  if (textContent) output.push(value.content as string);
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'content' || !textContent) collectText(child, output);
  }
}

function documentEndIndex(document: Record<string, unknown>): number {
  let maximum = 1;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.endIndex === 'number' && value.endIndex > maximum)
      maximum = value.endIndex;
    for (const child of Object.values(value)) visit(child);
  };
  visit(document.body);
  return maximum;
}

function parseSlides(markdown: string): Array<{ title: string; body: string }> {
  const chunks = markdown
    .split(/^\s*---+\s*$/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const slides = chunks.map((chunk, index) => {
    const lines = chunk.split('\n');
    const headingIndex = lines.findIndex((line) => /^#{1,6}\s+/.test(line));
    const title =
      headingIndex >= 0
        ? lines[headingIndex]!.replace(/^#{1,6}\s+/, '').trim()
        : `Slide ${index + 1}`;
    const body = markdownToPlainText(
      lines.filter((_, lineIndex) => lineIndex !== headingIndex).join('\n'),
    );
    return { title: title || `Slide ${index + 1}`, body };
  });
  return slides.length ? slides : [{ title: 'Untitled', body: '' }];
}
