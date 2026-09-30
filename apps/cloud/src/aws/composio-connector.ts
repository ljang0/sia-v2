import type { AppId, ToolName } from '../contracts.js';
import { assertComposioContract } from '../connector-contract.js';
import { CloudError, isRecord } from '../domain.js';
import { ConnectorReconnectRequiredError } from '../ports.js';
import type {
  ComposioConfig,
  ConnectorExecution,
  ConnectorFileUploadGrant,
  ConnectorLink,
  ConnectorProvider,
  ConnectorStatus,
  SecretProvider,
} from '../ports.js';
import { ensureTrailingSlash } from './shared.js';

export class ComposioConnector implements ConnectorProvider {
  constructor(private readonly secrets: SecretProvider) {}

  async beginConnection(
    userId: string,
    app: AppId,
    callbackUrl?: string,
  ): Promise<ConnectorLink> {
    if (app === 'google_workspace') {
      throw new CloudError(400, 'unsupported_app', 'Google Workspace uses Sia OAuth');
    }
    const config = await this.secrets.composio();
    const body = await composioRequest(config, 'POST', '/api/v3.1/connected_accounts/link', {
      auth_config_id: config.authConfigIds[app],
      user_id: userId,
      ...(callbackUrl === undefined ? {} : { callback_url: callbackUrl }),
    });
    return {
      connectionId: stringField(body, 'connected_account_id'),
      redirectUrl: httpsUrlField(body, 'redirect_url'),
      expiresAt: stringField(body, 'expires_at'),
    };
  }

  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    const config = await this.secrets.composio();
    const body = await composioRequest(
      config,
      'GET',
      `/api/v3.1/connected_accounts/${encodeURIComponent(connectionId)}`,
    );
    const rawStatus = normalizedConnectorStatus(body.status);
    const subordinateStatuses = [
      nestedConnectorStatus(body, 'state'),
      nestedConnectorStatus(body, 'data'),
    ].filter((value): value is string => value !== undefined);
    const observedStatuses = [rawStatus, ...subordinateStatuses];
    const status: ConnectorStatus['status'] = observedStatuses.some((value) =>
      ['DISABLED', 'REVOKED'].includes(value),
    )
      ? 'disconnected'
      : observedStatuses.some((value) => ['FAILED', 'EXPIRED', 'ERROR'].includes(value))
        ? 'failed'
        : ['ACTIVE', 'CONNECTED'].includes(rawStatus) &&
            subordinateStatuses.every((value) => ['ACTIVE', 'CONNECTED'].includes(value))
          ? 'connected'
          : observedStatuses.some((value) =>
                ['INITIALIZING', 'INITIATED', 'PENDING', 'ACTIVE', 'CONNECTED'].includes(value),
              )
            ? 'link_pending'
            : 'failed';
    const label =
      typeof body.account_display_name === 'string' &&
      body.account_display_name.trim().length > 0
        ? body.account_display_name.trim()
        : undefined;
    return { status, ...(label === undefined ? {} : { accountLabel: label }) };
  }

  async disconnect(connectionId: string): Promise<void> {
    const config = await this.secrets.composio();
    const encodedConnectionId = encodeURIComponent(connectionId);
    try {
      await composioRequest(
        config,
        'POST',
        `/api/v3.1/connected_accounts/${encodedConnectionId}/revoke`,
        undefined,
        {},
        [404, 410],
      );
    } catch (error) {
      if (!(error instanceof ConnectorUpstreamHttpError) || error.upstreamStatus !== 409) {
        throw error;
      }

      const account = await composioRequest(
        config,
        'GET',
        `/api/v3.1/connected_accounts/${encodedConnectionId}`,
        undefined,
        {},
        [404, 410],
      );
      const status = String(account.status ?? '').toUpperCase();
      if (!['INITIALIZING', 'INITIATED', 'PENDING', 'FAILED', 'EXPIRED'].includes(status)) {
        throw error;
      }
    }
    await composioRequest(
      config,
      'DELETE',
      `/api/v3.1/connected_accounts/${encodedConnectionId}`,
      undefined,
      {},
      [404, 410],
    );
  }

  async requestFileUpload(
    _connectionId: string,
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant> {
    const config = await this.secrets.composio();
    assertComposioContract(config, tool);
    const body = await composioRequest(config, 'POST', '/api/v3.1/files/upload/request', {
      toolkit_slug: 'googledrive',
      tool_slug: config.toolSlugs[tool],
      filename: fileName,
      mimetype: mimeType,
      md5,
    });
    const uploadUrlField =
      typeof body.new_presigned_url === 'string' ? 'new_presigned_url' : 'newPresignedUrl';
    return {
      providerKey: stringField(body, 'key'),
      uploadUrl: httpsUrlField(body, uploadUrlField),
    };
  }

  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    const config = await this.secrets.composio();
    assertComposioContract(config, tool);
    const slug = config.toolSlugs[tool];
    let body: Record<string, unknown>;
    try {
      body = await composioRequest(
        config,
        'POST',
        `/api/v3/tools/execute/${encodeURIComponent(slug)}`,
        {
          connected_account_id: connectionId,
          user_id: userId,
          version: config.toolVersions[tool],
          arguments: input,
        },
        { 'Idempotency-Key': idempotencyKey },
      );
    } catch (error) {
      if (
        error instanceof ConnectorUpstreamHttpError &&
        (error.upstreamStatus === 403 || error.upstreamStatus === 410)
      ) {
        throw new ConnectorReconnectRequiredError();
      }
      throw error;
    }
    if (body.successful === false && composioExecutionRequiresReconnect(body)) {
      throw new ConnectorReconnectRequiredError();
    }
    if (body.successful === false)
      throw new CloudError(
        502,
        'connector_execution_failed',
        'Connected app action failed',
        true,
      );
    const requestId = typeof body.log_id === 'string' ? body.log_id : undefined;
    return {
      data: body.data,
      ...(requestId === undefined ? {} : { providerRequestId: requestId }),
    };
  }
}

async function composioRequest(
  config: ComposioConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
  acceptedStatuses: readonly number[] = [],
): Promise<Record<string, unknown>> {
  const base = ensureTrailingSlash(config.baseUrl);
  const url = new URL(path.replace(/^\//, ''), base);
  if (url.protocol !== 'https:' || url.origin !== new URL(base).origin) {
    throw new CloudError(
      503,
      'connector_config_invalid',
      'Connector endpoint must use configured HTTPS origin',
    );
  }
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    // Never read or log the upstream error body; it may contain user data.
    throw new ConnectorUpstreamHttpError(response.status);
  }
  if (response.status === 204 || acceptedStatuses.includes(response.status)) return {};
  const parsed: unknown = await response.json();
  if (!isRecord(parsed))
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app returned invalid data',
    );
  return parsed;
}

class ConnectorUpstreamHttpError extends CloudError {
  constructor(readonly upstreamStatus: number) {
    super(
      502,
      'connector_upstream_error',
      `Connected app provider returned HTTP ${upstreamStatus}`,
      upstreamStatus === 429 || upstreamStatus >= 500,
    );
  }
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudError(502, 'connector_invalid_response', `Connected app omitted ${field}`);
  }
  return value;
}

function normalizedConnectorStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function composioExecutionRequiresReconnect(body: Record<string, unknown>): boolean {
  const error = body.error;
  if (!isRecord(error)) return false;
  if (error.auth_refresh_required === true) return true;

  const data = isRecord(error.data) ? error.data : undefined;
  return [error.status_code, error.mercury_last_http_status_code, data?.status_code].some(
    (status) => status === 401 || status === 403 || status === 410,
  );
}

function nestedConnectorStatus(
  record: Record<string, unknown>,
  field: 'state' | 'data',
): string | undefined {
  const container = record[field];
  if (!isRecord(container)) return undefined;
  const valueContainer =
    field === 'state' && isRecord(container.val) ? container.val : container;
  const status = normalizedConnectorStatus(valueContainer.status);
  return status || undefined;
}

function httpsUrlField(record: Record<string, unknown>, field: string): string {
  const value = stringField(record, field);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app returned an invalid URL',
    );
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app URL must use clean HTTPS',
    );
  }
  return value;
}
