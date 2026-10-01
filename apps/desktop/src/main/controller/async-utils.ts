/** Small promise helpers for bounded waits and host commands. */

export async function settleBeforeShutdown(
  operation: PromiseLike<unknown> | undefined,
  deadline: number,
): Promise<void> {
  if (!operation) return;
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) return;
  let timeout: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.resolve(operation).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, remaining);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function defaultRunCommand(
  file: string,
  args: readonly string[],
): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stdout } = await promisify(execFile)(file, [...args]);
  return stdout;
}
