import { expect, it } from 'vitest';
import { developmentRelaunchArguments } from './development-relaunch.js';

it('keeps a development restart in the same profile without putting credentials in arguments', () => {
  expect(
    developmentRelaunchArguments('/dev/Electron.app/Contents/MacOS/Electron', '/my app', {
      SIA_TEST_USER_DATA: '/test profile',
      SIA_TEST_WORKSPACE: '/test workspace',
      SIA_FAKE_SERVICES: '0',
      SIA_TEST_PLAINTEXT_STORAGE: '0',
      ELECTRON_RENDERER_URL: '',
      OPENAI_API_KEY: 'never-forward-this',
    }),
  ).toEqual([
    '-n',
    '-a',
    '/dev/Electron.app',
    '--env',
    'SIA_TEST_USER_DATA=/test profile',
    '--env',
    'SIA_TEST_WORKSPACE=/test workspace',
    '--env',
    'SIA_TEST_PLAINTEXT_STORAGE=0',
    '--env',
    'SIA_FAKE_SERVICES=0',
    '--env',
    'ELECTRON_RENDERER_URL=',
    '--args',
    '/my app',
  ]);
});
