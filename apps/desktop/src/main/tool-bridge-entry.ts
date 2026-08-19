import { connectUnixSocketCapability, serveMcpStdio } from '@sia/tool-bridge';

function parseArguments(argv: readonly string[]): {
  socketPath: string;
  capabilityId: string;
  sessionId: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error('Invalid tool-bridge arguments.');
    }
    if (values.has(key)) throw new Error(`Duplicate tool-bridge argument ${key}.`);
    values.set(key, value);
  }
  const socketPath = values.get('--socket');
  const capabilityId = values.get('--capability');
  const sessionId = values.get('--session');
  if (!socketPath || !capabilityId || !sessionId || values.size !== 3) {
    throw new Error('Missing tool-bridge capability arguments.');
  }
  return { socketPath, capabilityId, sessionId };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error('Tool bridge shutting down.'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  process.stdin.once('end', abort);
  const client = await connectUnixSocketCapability({
    socketPath: args.socketPath,
    capabilityId: args.capabilityId,
    sessionId: args.sessionId,
    signal: controller.signal,
  });
  const close = await serveMcpStdio(client, controller.signal);
  if (!controller.signal.aborted) {
    await new Promise<void>((resolve) =>
      controller.signal.addEventListener('abort', () => resolve(), { once: true }),
    );
  }
  await close();
}

void main().catch((error: unknown) => {
  // Never print argv, capability ids, tool arguments, or provider payloads.
  process.stderr.write(
    `Sia tool bridge failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
