import { expect, it, vi } from 'vitest';
import { freshPermissionProbe } from './fresh-permissions.js';

it('reads grants from a new Electron-as-Node child and reuses the answer briefly', async () => {
  let time = 0;
  const run = vi.fn(async () => '{"accessibility":true,"screenRecording":false}');
  const probe = freshPermissionProbe({
    executable: '/Applications/Sia.app/Contents/MacOS/Sia',
    entryPath: '/app/out/main/permission-probe.js',
    run,
    now: () => time,
  });
  const [first, second] = await Promise.all([probe(), probe()]);
  expect(first).toEqual({ accessibility: true, screenRecording: false });
  expect(second).toEqual(first);
  expect(run).toHaveBeenCalledExactlyOnceWith(
    '/Applications/Sia.app/Contents/MacOS/Sia',
    ['/app/out/main/permission-probe.js'],
    { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin:/bin' },
  );
  time = 2_000;
  await probe();
  expect(run).toHaveBeenCalledOnce();
  time = 3_500;
  await probe();
  expect(run).toHaveBeenCalledTimes(2);
});

it.each(['not json', '{"accessibility":"yes","screenRecording":true}', '{}'])(
  'treats unreadable output as unknown (%s)',
  async (output) => {
    const probe = freshPermissionProbe({
      executable: 'sia',
      entryPath: 'probe.js',
      run: async () => output,
    });
    expect(await probe()).toBeUndefined();
  },
);

it('treats a failed or timed-out child as unknown', async () => {
  const probe = freshPermissionProbe({
    executable: 'sia',
    entryPath: 'probe.js',
    run: async () => {
      throw new Error('timed out');
    },
  });
  expect(await probe()).toBeUndefined();
});
