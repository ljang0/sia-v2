const USER_PREFIX = 'USER#';

export function userPk(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

export function safeSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_');
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
