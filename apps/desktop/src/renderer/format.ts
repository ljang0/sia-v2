/** Display formats shared across the renderer. */

/** A file size in B, KB, or MB with one decimal place: "812 B", "3.4 KB", "1.2 MB". */
export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** A local date and clock time without the year: "Sep 30, 2:15 PM". */
export function shortDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
