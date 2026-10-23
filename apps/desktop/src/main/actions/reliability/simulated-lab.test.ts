import { expect, it } from 'vitest';
import { CuaService } from '../../mac/cua-service.js';
import { findRecordArray } from '../driver-records.js';
import { SimulatedTaskLab } from './simulated-lab.js';

const context = { kind: 'turn', threadId: 'fixture', turnId: 'turn' } as const;
it('uses the explicit simulated driver without native permissions or app inventory', async () => {
  const lab = new SimulatedTaskLab();
  await lab.reset({
    id: 'test',
    category: 'test',
    title: 'Test',
    request: 'Read',
    fields: 'value: number',
    expected: { value: 42 },
    mustObserve: ['/'],
    app: { start: '/', pages: { '/': { title: 'Test', text: '42' } } },
  });
  const driver = new CuaService(
    { authorize: async () => 'deny' },
    { fakePermissions: true, driverFactory: () => lab.createDriver() },
  );
  try {
    expect((await driver.permissions()).detail).toBe('Simulated permissions for development.');
    const inventory = await lab.call(driver, 'list_apps', {}, context);
    expect(findRecordArray(inventory, 'apps')).toEqual([
      { pid: 4242, name: 'Task Lab', bundle_id: 'local.fixture.tasklab' },
    ]);
    const state = await lab.call(
      driver,
      'get_window_state',
      { pid: 4242, window_id: 91 },
      context,
    );
    expect(JSON.stringify(state)).toContain('42');
    expect(lab.observed.has('/')).toBe(true);
    await expect(
      lab.call(
        driver,
        'click',
        { pid: 4242, window_id: 91, delivery_mode: 'foreground' },
        context,
      ),
    ).rejects.toThrow('background fixture');
  } finally {
    await driver.shutdown();
  }
});

it('rejects foreign inventory instead of exposing it when a driver is misconfigured', async () => {
  const lab = new SimulatedTaskLab();
  const driver = new CuaService(
    { authorize: async () => 'deny' },
    {
      fakePermissions: true,
      driverFactory: () => ({
        callTool: async () => ({
          rawJson: JSON.stringify({ apps: [{ pid: 123, name: 'Unrelated app' }] }),
        }),
        shutdown: async () => undefined,
      }),
    },
  );
  try {
    await expect(lab.call(driver, 'list_apps', {}, context)).rejects.toThrow(
      'must never use a native driver inventory',
    );
  } finally {
    await driver.shutdown();
  }
});
