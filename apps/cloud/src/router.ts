import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type {
  AuthContext,
  CommitActionRequest,
  ConnectorUploadRequest,
  DeletionScope,
  InviteRequest,
  PrepareActionRequest,
  ResearchBatchRequest,
  ResearchEvent,
  RegistrationRequest,
} from './contracts.js';
import {
  CloudError,
  isRecord,
  parseAppId,
  parseToolName,
  requireRecord,
  requireString,
} from './domain.js';
import type { createServices } from './services.js';

type Services = ReturnType<typeof createServices>;

export async function routeControlRequest(
  event: APIGatewayProxyEvent,
  services: Services,
): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext.requestId;
  try {
    const method = event.httpMethod.toUpperCase();
    const path = normalizePath(event.path);

    if (method === 'GET' && path === '/v1/oauth/google/callback') {
      const state = requireString(event.queryStringParameters?.state, 'state', { max: 256 });
      const code = optionalQueryString(event.queryStringParameters?.code, 'code', 4_096);
      const error = optionalQueryString(event.queryStringParameters?.error, 'error', 256);
      const result = await services.connections.completeGoogleOAuth({
        state,
        ...(code === undefined ? {} : { code }),
        ...(error === undefined ? {} : { error }),
      });
      return oauthHtml(result.connected, result.failure);
    }

    if (method === 'POST' && path === '/v1/auth/register') {
      const body = parseBody(event);
      if (body.researchEnrollmentAcknowledged !== true) {
        throw new CloudError(
          400,
          'research_enrollment_required',
          'Acknowledge the research release before creating an account',
        );
      }
      const request: RegistrationRequest = {
        email: requireString(body.email, 'email', { max: 254 }),
        researchEnrollmentAcknowledged: true,
      };
      const sourceIp = requireString(event.requestContext.identity?.sourceIp, 'sourceIp', {
        max: 64,
      });
      return json(202, await services.registration.create(request, sourceIp));
    }

    const user = authFromEvent(event);

    if (method === 'GET' && path === '/v1/session') {
      return json(200, services.session.status(user));
    }
    if (method === 'GET' && path === '/v1/meta/capabilities') {
      return json(200, await services.meta.capabilities(user));
    }

    const retireGoogleMatch = /^\/v1\/connections\/([^/]+)\/retire-superseded$/.exec(path);
    if (retireGoogleMatch && method === 'POST') {
      const app = parseAppId(decodeURIComponent(retireGoogleMatch[1] ?? ''));
      const body = parseBody(event);
      return json(
        200,
        await services.connections.retireSupersededGoogle(
          user,
          app,
          requireString(body.connectionId, 'connectionId', { max: 256 }),
          requireString(body.replacementConnectionId, 'replacementConnectionId', { max: 256 }),
        ),
      );
    }

    const connectionMatch = /^\/v1\/connections\/([^/]+)$/.exec(path);
    if (connectionMatch) {
      const app = parseAppId(decodeURIComponent(connectionMatch[1] ?? ''));
      if (method === 'POST') {
        const body = parseOptionalBody(event);
        const callbackUrl = optionalString(body.callbackUrl, 'callbackUrl', 2_048);
        const access = optionalGoogleAccess(body.access);
        return json(201, await services.connections.start(user, app, callbackUrl, access));
      }
      if (method === 'GET') return json(200, await services.connections.status(user, app));
      if (method === 'DELETE') {
        const connectionId = requireString(
          event.queryStringParameters?.connectionId,
          'connectionId',
          { max: 256 },
        );
        return json(200, await services.connections.disconnect(user, app, connectionId));
      }
    }

    if (method === 'POST' && path === '/v1/actions/prepare') {
      return json(
        200,
        await services.actions.prepare(user, parsePrepareAction(parseBody(event))),
      );
    }
    if (method === 'POST' && path === '/v1/actions/commit') {
      return json(
        200,
        await services.actions.commit(user, parseCommitAction(parseBody(event))),
      );
    }
    if (method === 'POST' && path === '/v1/connector-files/upload-request') {
      return json(
        201,
        await services.connectorFiles.requestUpload(
          user,
          parseConnectorUpload(parseBody(event)),
        ),
      );
    }
    if (method === 'POST' && path === '/v1/research/batches') {
      const response = json(
        201,
        await services.research.upload(user, parseResearchBatch(parseBody(event))),
      );
      emitMetric('ResearchUploadSuccess');
      return response;
    }
    if (path === '/v1/research/export') {
      if (method === 'POST') return json(202, await services.research.export(user));
      if (method === 'GET') {
        const exportId = requireString(event.queryStringParameters?.exportId, 'exportId', {
          max: 128,
        });
        return json(200, await services.research.exportStatus(user, exportId));
      }
    }
    if (path === '/v1/research/delete') {
      if (method === 'POST') {
        const body = parseOptionalBody(event);
        return json(
          202,
          await services.research.requestDeletion(user, parseDeletionScope(body.scope)),
        );
      }
      if (method === 'GET') {
        const state = await services.research.status(user);
        return json(200, { deletion: state ?? null });
      }
    }
    if (method === 'GET' && path === '/v1/admin/research/participants') {
      return json(200, await services.researchAdmin.participants(user));
    }
    if (method === 'GET' && path === '/v1/admin/research/batches') {
      const subject = requireString(event.queryStringParameters?.subject, 'subject', {
        max: 256,
      });
      return json(200, await services.researchAdmin.batches(user, subject));
    }
    if (method === 'GET' && path === '/v1/admin/research/batch') {
      const subject = requireString(event.queryStringParameters?.subject, 'subject', {
        max: 256,
      });
      const batchId = requireString(event.queryStringParameters?.batchId, 'batchId', {
        max: 128,
      });
      return json(200, await services.researchAdmin.batch(user, subject, batchId));
    }
    if (path === '/v1/admin/invites') {
      if (method === 'POST') {
        const body = parseBody(event);
        const request: InviteRequest = {
          email: requireString(body.email, 'email', { max: 254 }),
        };
        return json(201, await services.invites.create(user, request));
      }
      if (method === 'GET') return json(200, await services.invites.list(user));
    }

    throw new CloudError(404, 'route_not_found', 'Route not found');
  } catch (error) {
    const cloudError = normalizeError(error);
    if (
      event.httpMethod.toUpperCase() === 'POST' &&
      normalizePath(event.path) === '/v1/research/batches'
    ) {
      emitMetric('ResearchUploadFailure');
    }
    // Metadata only. Never add event.body, headers, query values, connector results, or stack traces.
    console.warn(
      JSON.stringify({
        logType: 'request',
        requestId,
        method: event.httpMethod,
        route: routeLabel(event.path),
        status: cloudError.status,
        code: cloudError.code,
      }),
    );
    return json(cloudError.status, {
      error: {
        code: cloudError.code,
        message: cloudError.message,
        retryable: cloudError.retryable,
      },
      requestId,
    });
  }
}

function emitMetric(name: 'ResearchUploadSuccess' | 'ResearchUploadFailure'): void {
  console.info(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'Sia/Research',
            Dimensions: [[]],
            Metrics: [{ Name: name, Unit: 'Count' }],
          },
        ],
      },
      [name]: 1,
    }),
  );
}

export function authFromEvent(event: APIGatewayProxyEvent): AuthContext {
  const claims = event.requestContext.authorizer?.claims;
  const subject = claims?.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new CloudError(401, 'authentication_required', 'Sign in is required');
  }
  const email = typeof claims?.email === 'string' ? claims.email : undefined;
  const groups = parseGroups(claims?.['cognito:groups']);
  return { subject, groups, ...(email === undefined ? {} : { email }) };
}

export function parseBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  if (!event.body) throw new CloudError(400, 'body_required', 'A JSON body is required');
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (Buffer.byteLength(raw) > 5 * 1024 * 1024) {
    throw new CloudError(413, 'request_too_large', 'Request body exceeds 5 MiB');
  }
  try {
    return requireRecord(JSON.parse(raw));
  } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

export function normalizeError(error: unknown): CloudError {
  if (error instanceof CloudError) return error;
  return new CloudError(500, 'internal_error', 'The request could not be completed', true);
}

export function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

function oauthHtml(
  connected: boolean,
  failure?: 'access_denied' | 'missing_scopes',
): APIGatewayProxyResult {
  const title = connected
    ? 'Google Workspace connected'
    : failure === 'missing_scopes'
      ? 'More Google permissions needed'
      : 'Google connection cancelled';
  const detail = connected
    ? 'Gmail, Drive, Docs, Sheets, and Slides are ready in Sia. You can close this window.'
    : failure === 'missing_scopes'
      ? 'No Google connection was saved. Return to Sia, choose Reconnect, and select every requested Google Workspace permission before continuing.'
      : 'Nothing was connected. You can close this window and try again from Sia.';
  return {
    statusCode: connected ? 200 : 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
    body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f7f7f3;color:#17211d;font:16px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:34rem;margin:2rem;padding:2.5rem;border:1px solid #dce2de;border-radius:20px;background:#fff;box-shadow:0 18px 50px rgba(23,33,29,.08)}h1{font-size:1.55rem;line-height:1.2;margin:0 0 .75rem}p{color:#56615c;margin:0}</style><main class="card"><h1>${title}</h1><p>${detail}</p></main></html>`,
  };
}

function parseOptionalBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  return event.body ? parseBody(event) : {};
}

function optionalQueryString(
  value: string | undefined,
  label: string,
  maximum: number,
): string | undefined {
  return value === undefined ? undefined : requireString(value, label, { max: maximum });
}

function parsePrepareAction(body: Record<string, unknown>): PrepareActionRequest {
  return {
    connectionId: requireString(body.connectionId, 'connectionId', { max: 256 }),
    tool: parseToolName(body.tool),
    input: requireRecord(body.input, 'input'),
  };
}

function parseCommitAction(body: Record<string, unknown>): CommitActionRequest {
  return {
    actionId: requireString(body.actionId, 'actionId', { max: 128 }),
    digest: requireString(body.digest, 'digest', { max: 128 }),
    input: requireRecord(body.input, 'input'),
  };
}

function parseConnectorUpload(body: Record<string, unknown>): ConnectorUploadRequest {
  return {
    connectionId: requireString(body.connectionId, 'connectionId', { max: 256 }),
    fileName: requireString(body.fileName, 'fileName', { max: 255 }),
    mimeType: requireString(body.mimeType, 'mimeType', { max: 127 }),
    byteLength: requireInteger(body.byteLength, 'byteLength'),
    md5: requireString(body.md5, 'md5', { max: 128 }),
    sha256: requireString(body.sha256, 'sha256', { max: 128 }),
  };
}

function parseResearchBatch(body: Record<string, unknown>): ResearchBatchRequest {
  const consent = requireRecord(body.consent, 'consent');
  if (body.format !== undefined && body.format !== 'filtered_v2' && body.format !== 'raw_v1') {
    throw new CloudError(
      400,
      'invalid_research_format',
      'format must be filtered_v2 or raw_v1',
    );
  }
  if (!Array.isArray(body.events))
    throw new CloudError(400, 'invalid_research_batch', 'events must be an array');
  const events = body.events.map((value, index): ResearchEvent => {
    const event = requireRecord(value, `events[${index}]`);
    if (
      !Array.isArray(event.taints) ||
      event.taints.some((taint) => typeof taint !== 'string')
    ) {
      throw new CloudError(
        400,
        'invalid_research_event',
        `events[${index}].taints must be strings`,
      );
    }
    return {
      id: requireString(event.id, `events[${index}].id`, { max: 128 }),
      occurredAt: requireString(event.occurredAt, `events[${index}].occurredAt`, { max: 64 }),
      classification: requireString(event.classification, `events[${index}].classification`, {
        max: 32,
      }) as ResearchEvent['classification'],
      taints: event.taints as ResearchEvent['taints'],
      kind: requireString(event.kind, `events[${index}].kind`, { max: 128 }),
      payload: event.payload,
      ...(Array.isArray(event.sourceEventIds)
        ? {
            sourceEventIds: event.sourceEventIds.map((id, sourceIndex) =>
              requireString(id, `events[${index}].sourceEventIds[${sourceIndex}]`, {
                max: 128,
              }),
            ),
          }
        : {}),
    };
  });
  const purpose = requireString(consent.purpose, 'consent.purpose', { max: 64 });
  if (purpose !== 'research_evaluation_debugging') {
    throw new CloudError(400, 'invalid_consent_purpose', 'Unsupported research purpose');
  }
  return {
    batchId: requireString(body.batchId, 'batchId', { max: 128 }),
    ...(body.format === 'filtered_v2' || body.format === 'raw_v1'
      ? { format: body.format }
      : {}),
    ...(body.scope === undefined ? {} : { scope: parseResearchScope(body.scope) }),
    consent: {
      version: requireString(consent.version, 'consent.version', { max: 64 }),
      acceptedAt: requireString(consent.acceptedAt, 'consent.acceptedAt', { max: 64 }),
      purpose,
    },
    events,
  };
}

function parseResearchScope(value: unknown): NonNullable<ResearchBatchRequest['scope']> {
  const scope = requireRecord(value, 'scope');
  if (!Array.isArray(scope.eventKinds)) {
    throw new CloudError(400, 'invalid_research_scope', 'scope.eventKinds must be an array');
  }
  const optionalSequence = (input: unknown, label: string): number | undefined => {
    if (input === undefined) return undefined;
    if (!Number.isSafeInteger(input) || Number(input) < 0) {
      throw new CloudError(
        400,
        'invalid_research_scope',
        `${label} must be a positive integer`,
      );
    }
    return Number(input);
  };
  const sequenceStart = optionalSequence(scope.sequenceStart, 'scope.sequenceStart');
  const sequenceEnd = optionalSequence(scope.sequenceEnd, 'scope.sequenceEnd');
  return {
    threadId: requireString(scope.threadId, 'scope.threadId', { max: 128 }),
    turnId: requireString(scope.turnId, 'scope.turnId', { max: 128 }),
    ...(sequenceStart === undefined ? {} : { sequenceStart }),
    ...(sequenceEnd === undefined ? {} : { sequenceEnd }),
    eventKinds: scope.eventKinds.map((kind, index) =>
      requireString(kind, `scope.eventKinds[${index}]`, { max: 128 }),
    ),
  };
}

function parseDeletionScope(value: unknown): DeletionScope {
  if (value === undefined || value === 'research') return 'research';
  if (value === 'account') return 'account';
  throw new CloudError(
    400,
    'invalid_deletion_scope',
    'Deletion scope must be research or account',
  );
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new CloudError(400, 'invalid_request', `${label} must be an integer`);
  }
  return value;
}

function parseGroups(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalString(value: unknown, label: string, max: number): string | undefined {
  return value === undefined ? undefined : requireString(value, label, { max });
}

function optionalGoogleAccess(value: unknown): 'read_only' | 'read_write' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'read_only' && value !== 'read_write') {
    throw new CloudError(
      400,
      'invalid_request',
      'Google access must be read_only or read_write',
    );
  }
  return value;
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
}

function routeLabel(path: string): string {
  return path
    .replace(
      /^\/v1\/connections\/[^/]+\/retire-superseded$/,
      '/v1/connections/{app}/retire-superseded',
    )
    .replace(/^\/v1\/connections\/[^/]+$/, '/v1/connections/{app}');
}
