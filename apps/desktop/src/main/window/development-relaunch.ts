import { resolve } from 'node:path';

/**
 * `open` arguments that restart this exact app bundle with its original arguments. A plain
 * relaunch on macOS can resolve the bundle identifier instead, starting another installed copy
 * of Sia (for example /Applications) and dropping arguments such as --user-data-dir.
 */
export function packagedRelaunchArguments(
  executable: string,
  argv: readonly string[],
): string[] {
  const args = argv.slice(1).filter((arg) => !arg.startsWith('-psn_'));
  return [
    '-n',
    '-a',
    resolve(executable, '../../..'),
    ...(args.length ? ['--args', ...args] : []),
  ];
}

export function developmentRelaunchArguments(
  executable: string,
  appPath: string,
  environment: NodeJS.ProcessEnv,
): string[] {
  const flags = [
    'SIA_TEST_USER_DATA',
    'SIA_TEST_WORKSPACE',
    'SIA_TEST_PLAINTEXT_STORAGE',
    'SIA_FAKE_SERVICES',
    'ELECTRON_RENDERER_URL',
  ];
  return [
    '-n',
    '-a',
    resolve(executable, '../../..'),
    ...flags.flatMap((key) =>
      environment[key] === undefined ? [] : ['--env', `${key}=${environment[key]}`],
    ),
    '--args',
    appPath,
  ];
}
