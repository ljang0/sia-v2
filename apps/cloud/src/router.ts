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
    const user = authFromEvent(event);
    const method = event.httpMethod.toUpperCase();
    const path = normalizePath(event.path);

    const connectionMatch = /^\/v1\/connections\/([^/]+)$/.exec(path);
    if (connectionMatch) {
      const app = parseAppId(decodeURIComponent(connectionMatch[1] ?? ''));
      if (method === 'POST') {
        const body = parseOptionalBody(event);
        const callbackUrl = optionalString(body.callbackUrl, 'callbackUrl', 2_048);
        return json(201, await services.connections.start(user, app, callbackUrl));
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
      return json(
        201,
        await services.research.upload(user, parseResearchBatch(parseBody(event))),
      );
    }
    if (method === 'POST' && path === '/v1/research/export') {
      return json(201, await services.research.export(user));
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

function parseOptionalBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  return event.body ? parseBody(event) : {};
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
    consent: {
      version: requireString(consent.version, 'consent.version', { max: 64 }),
      acceptedAt: requireString(consent.acceptedAt, 'consent.acceptedAt', { max: 64 }),
      purpose,
    },
    events,
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

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
}

function routeLabel(path: string): string {
  return path.replace(/^\/v1\/connections\/[^/]+$/, '/v1/connections/{app}');
}
