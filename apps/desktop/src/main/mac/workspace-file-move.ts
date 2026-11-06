import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { ActionExecutionResult } from '@sia/action-gateway';

const exec = promisify(execFile);
export interface WorkspaceMoveInput {
  workspace: string;
  source: string;
  destination: string;
  expected_sha256: string;
}
export type WorkspaceFileMove = (
  input: WorkspaceMoveInput,
  signal?: AbortSignal,
) => Promise<ActionExecutionResult>;

/** Fixed filesystem operation in the signed helper, never a shell or UI command. */
export function workspaceFileMover(helperPath: string): WorkspaceFileMove {
  return async (input, signal) => {
    signal?.throwIfAborted();
    const uncertain = (): ActionExecutionResult => ({
      outcome: 'accepted_unverified',
      summary:
        'The move may have completed but could not be verified. Inspect both paths and their revisions before continuing; do not repeat the move blindly.',
      data: {
        source: input.source,
        destination: input.destination,
        input_delivery_uncertain: true,
      },
    });
    try {
      const { stdout } = await exec(
        helperPath,
        [
          '--workspace-file-move',
          input.workspace,
          input.source,
          input.destination,
          input.expected_sha256,
        ],
        { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000, maxBuffer: 16_384, signal },
      );
      const value: unknown = JSON.parse(stdout);
      if (!value || typeof value !== 'object') return uncertain();
      const record = value as Record<string, unknown>;
      if (record.moved === false && typeof record.error === 'string')
        return { outcome: 'refused', summary: record.error.slice(0, 300) };
      if (
        record.moved !== true ||
        record.verified !== true ||
        record.source !== input.source ||
        record.destination !== input.destination ||
        record.sha256 !== input.expected_sha256 ||
        typeof record.bytes !== 'number' ||
        !Number.isInteger(record.bytes) ||
        record.bytes < 0 ||
        record.bytes > 256 * 1024
      )
        return uncertain();
      return {
        outcome: 'verified',
        summary:
          'Moved the file without overwriting a destination and verified its bytes and new location.',
        data: {
          source: input.source,
          name: input.destination,
          path: join(input.workspace, input.destination),
          bytes: record.bytes,
          sha256: record.sha256,
        },
      };
    } catch {
      return uncertain();
    }
  };
}
