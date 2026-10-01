/** WorkspaceOperationError and the path and number guards every workspace service shares. */

import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export type WorkspaceOperationErrorCode =
  | 'invalid_workspace'
  | 'not_git_repository'
  | 'invalid_path'
  | 'path_not_tracked'
  | 'invalid_revision'
  | 'invalid_private_root'
  | 'command_failed'
  | 'timed_out'
  | 'aborted'
  | 'output_limit';

export class WorkspaceOperationError extends Error {
  readonly code: WorkspaceOperationErrorCode;

  constructor(code: WorkspaceOperationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkspaceOperationError';
    this.code = code;
  }
}

export async function resolveDirectory(
  value: string,
  errorCode: 'invalid_workspace' | 'not_git_repository',
): Promise<string> {
  const requested = requireAbsolutePath(value, 'Workspace', errorCode);
  try {
    const resolved = await realpath(requested);
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new Error('Not a directory');
    return resolved;
  } catch (error) {
    throw new WorkspaceOperationError(errorCode, 'The workspace directory is unavailable.', {
      cause: error,
    });
  }
}

export function requireAbsolutePath(
  value: string,
  label: string,
  errorCode: 'invalid_workspace' | 'not_git_repository' | 'invalid_private_root',
): string {
  if (!value || value.includes('\0') || !isAbsolute(value)) {
    throw new WorkspaceOperationError(errorCode, `${label} must be an absolute path.`);
  }
  return resolve(value);
}

export function assertContainedPath(
  root: string,
  candidate: string,
  errorCode: 'invalid_workspace' | 'invalid_path' | 'invalid_private_root',
): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new WorkspaceOperationError(errorCode, 'The path escapes its allowed root.');
  }
}

export function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
