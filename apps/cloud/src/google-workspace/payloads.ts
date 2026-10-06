import { CloudError, isRecord } from '../domain.js';

export async function boundedJson(
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

export function requiredStringField(record: Record<string, unknown>, key: string): string {
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

export function optionalStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

export function stringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string')
    throw new CloudError(400, 'invalid_connector_input', `${key} is invalid`);
  return value;
}

export function numberInput(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CloudError(400, 'invalid_connector_input', `${key} is invalid`);
  }
  return value;
}

export function googleUrl(
  endpoint: string,
  parameters: Record<string, string | number | boolean>,
): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, String(value));
  return url.toString();
}

export function gmailRawMessage(input: Record<string, unknown>): string {
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

export function recordId(record: Record<string, unknown>): string[] {
  return typeof record.id === 'string' ? [record.id] : [];
}

export function idsFromArray(value: unknown): string[] {
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

export function markdownToPlainText(markdown: string): string {
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

export function extractDocumentText(document: Record<string, unknown>): string {
  const fragments: string[] = [];
  collectText(document.body, fragments);
  if (Array.isArray(document.tabs)) {
    for (const tab of document.tabs) if (isRecord(tab)) collectText(tab.documentTab, fragments);
  }
  return fragments.join('');
}

export function extractDocumentTabs(document: Record<string, unknown>): unknown[] {
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

export function documentEndIndex(document: Record<string, unknown>): number {
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

export function parseSlides(markdown: string): Array<{ title: string; body: string }> {
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

export function recordInput(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = input[key];
  if (!isRecord(value))
    throw new CloudError(400, 'invalid_connector_input', `${key} is invalid`);
  return value;
}

/** The fields a person needs to recognize an event; raw Google metadata stays out of turns. */
export function compactCalendarEvent(event: Record<string, unknown>): Record<string, unknown> {
  const attendees = Array.isArray(event.attendees)
    ? event.attendees.flatMap((attendee) =>
        isRecord(attendee) && typeof attendee.email === 'string'
          ? [
              {
                email: attendee.email,
                ...(typeof attendee.responseStatus === 'string'
                  ? { responseStatus: attendee.responseStatus }
                  : {}),
              },
            ]
          : [],
      )
    : [];
  return {
    id: event.id,
    summary: event.summary,
    start: event.start,
    end: event.end,
    location: event.location,
    attendees,
    htmlLink: event.htmlLink,
    status: event.status,
  };
}

export function compactTask(task: Record<string, unknown>): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    due: task.due,
    completed: task.completed,
    webViewLink: task.webViewLink,
  };
}

export function recordsFromArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
