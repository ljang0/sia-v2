/** Text helpers for conversation search results. */

export function searchExcerpt(value: string, needle: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  const index = compact.toLocaleLowerCase().indexOf(needle);
  if (index < 0) return compact.slice(0, 180);
  const start = Math.max(0, index - 60);
  const end = Math.min(compact.length, index + needle.length + 100);
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`;
}

export function extractHttpUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s<>()]+/gi)].map((match) =>
    match[0].replace(/[),.;!?]+$/, ''),
  );
}

export function safeUrlHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'Link';
  }
}
