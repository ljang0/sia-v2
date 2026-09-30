/** One file change as the provider reported it (Codex App Server `fileChange` items). */
export interface RecordedFileChange {
  path: string;
  change: string;
  movePath?: string | undefined;
  diff?: string | undefined;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;

/**
 * Sia can put a file back only when the provider recorded what it was: an added file's content,
 * a deleted file's content, or an edit's line diff. A rename without a diff moved the file as is.
 */
export function reversibleFileChange(file: RecordedFileChange): boolean {
  if (file.change === 'add') return true;
  if (file.change === 'delete') return file.diff !== undefined;
  if (file.change === 'update') return HUNK_HEADER.test(file.diff ?? '');
  if (file.change === 'rename') {
    return (
      Boolean(file.movePath) && (onlyMoved(file.diff) || HUNK_HEADER.test(file.diff ?? ''))
    );
  }
  return false;
}

/** A rename's diff with no line changes: empty, or only Codex's "Moved to: …" note. */
export function onlyMoved(diff: string | undefined): boolean {
  return !(diff ?? '')
    .split('\n')
    .some((line) => line.trim() && !line.startsWith('Moved to: '));
}
