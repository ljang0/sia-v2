import { resolve } from 'node:path';

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
