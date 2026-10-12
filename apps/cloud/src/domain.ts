import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  APP_IDS,
  RESEARCH_CLASSIFICATIONS,
  RESEARCH_TAINTS,
  TOOL_POLICIES,
  type AppId,
  type ResearchClassification,
  type ResearchEvent,
  type ResearchTaint,
  type ToolName,
} from './contracts.js';

export class CloudError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

export const ids = { next: (): string => randomUUID() };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, label = 'body'): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CloudError(400, 'invalid_request', `${label} must be an object`);
  }
  return value;
}

export function requireString(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {},
): string {
  const min = options.min ?? 1;
  const max = options.max ?? 10_000;
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new CloudError(400, 'invalid_request', `${label} must be ${min}-${max} characters`);
  }
  return value;
}

export function parseAppId(value: unknown): AppId {
  if (typeof value !== 'string' || !(APP_IDS as readonly string[]).includes(value)) {
    throw new CloudError(404, 'unsupported_app', 'That app is not available in this alpha');
  }
  return value as AppId;
}

export function parseToolName(value: unknown): ToolName {
  if (typeof value !== 'string' || !(value in TOOL_POLICIES)) {
    throw new CloudError(400, 'tool_not_allowed', 'That connector tool is not allowlisted');
  }
  return value as ToolName;
}

export function canonicalJson(value: unknown): string {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (isRecord(input)) {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .filter((key) => input[key] !== undefined)
          .map((key) => [key, visit(input[key])]),
      );
    }
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean' ||
      (typeof input === 'number' && Number.isFinite(input))
    ) {
      return input;
    }
    throw new CloudError(400, 'invalid_json_value', 'Input contains a non-JSON value');
  };
  return JSON.stringify(visit(value));
}

export function actionDigest(
  actionId: string,
  userId: string,
  connectionId: string,
  tool: ToolName,
  input: Record<string, unknown>,
): string {
  return createHash('sha256')
    .update(canonicalJson({ actionId, userId, connectionId, tool, input }))
    .digest('base64url');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const SENSITIVE_KEY =
  /(^|_)(authorization|password|passwd|passcode|cookie|set_cookie|token|secret|api_?key|private_?key|keychain|credential)s?($|_)/i;
const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i },
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { name: 'provider_key', pattern: /\b(?:sk|xai|meta|composio)[-_][A-Za-z0-9_-]{16,}\b/i },
];

export interface RedactionResult {
  value: unknown;
  redactions: string[];
}

export function redactSensitive(value: unknown): RedactionResult {
  const redactions: string[] = [];
  const seen = new WeakSet<object>();

  const visit = (input: unknown, path: string): unknown => {
    if (typeof input === 'string') {
      let output = input;
      for (const item of SECRET_PATTERNS) {
        if (item.pattern.test(output)) {
          redactions.push(`${path}:${item.name}`);
          output = output.replace(item.pattern, '[REDACTED]');
        }
      }
      return output;
    }
    if (Array.isArray(input))
      return input.map((item, index) => visit(item, `${path}[${index}]`));
    if (isRecord(input)) {
      if (seen.has(input))
        throw new CloudError(400, 'invalid_json_value', 'Cyclic data is not accepted');
      seen.add(input);
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(input)) {
        const childPath = `${path}.${key}`;
        if (SENSITIVE_KEY.test(key)) {
          redactions.push(`${childPath}:sensitive_key`);
          result[key] = '[REDACTED]';
        } else {
          result[key] = visit(child, childPath);
        }
      }
      seen.delete(input);
      return result;
    }
    return input;
  };

  return { value: visit(value, '$'), redactions };
}

export function derivedClassification(
  taints: readonly ResearchTaint[],
): ResearchClassification {
  if (taints.some((taint) => taint === 'credential' || taint === 'authentication_surface')) {
    return 'excluded';
  }
  return taints.length > 0 ? 'operational_only' : 'research_allowed';
}

export function assertResearchEvent(event: ResearchEvent, allowRaw = false): ResearchEvent {
  requireString(event.id, 'event.id', { max: 128 });
  requireString(event.kind, 'event.kind', { max: 128 });
  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    throw new CloudError(
      400,
      'invalid_research_event',
      'event.occurredAt must be an ISO timestamp',
    );
  }
  if (!(RESEARCH_CLASSIFICATIONS as readonly string[]).includes(event.classification)) {
    throw new CloudError(400, 'invalid_research_event', 'Unknown research classification');
  }
  if (
    !Array.isArray(event.taints) ||
    event.taints.some((taint) => !(RESEARCH_TAINTS as readonly string[]).includes(taint))
  ) {
    throw new CloudError(400, 'invalid_research_event', 'Unknown research taint');
  }
  const enforced = derivedClassification(event.taints);
  if (event.classification !== enforced || enforced !== 'research_allowed') {
    throw new CloudError(
      400,
      'research_data_not_allowed',
      'Only untainted research_allowed events may be uploaded',
    );
  }
  if (allowRaw && (event.kind === 'raw.event' || event.kind === 'raw.event_chunk')) {
    canonicalJson(event.payload);
    return event;
  }
  const redacted = redactSensitive(event.payload);
  if (redacted.redactions.length > 0) {
    throw new CloudError(
      400,
      'sensitive_research_data',
      'The batch contains secret-shaped data and was not uploaded',
    );
  }
  canonicalJson(redacted.value);
  return { ...event, payload: redacted.value };
}

export function makeActionPreview(
  tool: ToolName,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (tool) {
    case 'mail.create_draft':
    case 'mail.send':
    case 'drive.upload':
    case 'drive.share':
    case 'docs.create':
    case 'docs.append':
    case 'sheets.create':
    case 'sheets.update':
    case 'sheets.append':
    case 'slides.create':
    case 'slides.append':
    case 'calendar.create_event':
    case 'calendar.update_event':
    case 'calendar.delete_event':
    case 'tasks.create':
    case 'tasks.update':
    case 'slack.post':
      // The approval digest binds the complete input. Returning that same
      // canonical JSON value makes the preview exact: no execution-affecting
      // field can be hidden behind a hand-picked summary.
      return JSON.parse(canonicalJson(input)) as Record<string, unknown>;
    default:
      throw new CloudError(400, 'preview_not_required', 'Read-only tools execute directly');
  }
}
