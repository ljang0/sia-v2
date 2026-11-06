/** Native navigation failures carry no page content or permission decision. */
export class BrowserNavigationError extends Error {
  constructor(readonly networkCode: string) {
    super(`Browser navigation failed: ${networkCode}`);
    this.name = 'BrowserNavigationError';
  }
}

const networkCodes = new Set([
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_TIMED_OUT',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_CLOSED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_ADDRESS_UNREACHABLE',
]);

/** Accept only the driver's exact Page.navigate errorText envelope, not arbitrary text. */
export function browserNavigationError(
  tool: string,
  value: unknown,
): BrowserNavigationError | undefined {
  if (tool !== 'browser_navigate' || !value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (record.isError !== true || !Array.isArray(record.content) || record.content.length !== 1)
    return;
  const item = record.content[0] as Record<string, unknown> | undefined;
  if (item?.type !== 'text' || typeof item.text !== 'string') return;
  const match = /^navigation failed: net::(ERR_[A-Z_]+)$/.exec(item.text);
  if (match?.[1] && networkCodes.has(match[1])) return new BrowserNavigationError(match[1]);
  return;
}
