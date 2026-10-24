import { expect, it } from 'vitest';
import { CuaService } from '../../mac/cua-service.js';
import { findElementRecords, findRecordArray } from '../driver-records.js';
import { BackgroundTaskLab } from './lab.js';

const probe =
  process.env.SIA_RELIABILITY_DRIVER_PROBE === '1' &&
  process.env.SIA_RELIABILITY_REAL_CUA === '1'
    ? it
    : it.skip;
probe(
  'discovers only the disposable lab without a model turn or input',
  async () => {
    const lab = await BackgroundTaskLab.connect(process.env.SIA_RELIABILITY_LAB!);
    const driver = new CuaService({ authorize: async () => 'deny' });
    try {
      const context = { kind: 'direct_user', operation: 'access_check' } as const;
      const apps = await lab.call(driver, 'list_apps', {}, context);
      const windows = await lab.call(
        driver,
        'list_windows',
        { on_screen_only: false },
        context,
      );
      expect(findRecordArray(apps, 'apps')).toHaveLength(1);
      expect(findRecordArray(windows, 'windows').length).toBeGreaterThan(0);
      const target = findRecordArray(windows, 'windows')[0]!;
      const state = await lab.call(
        driver,
        'get_window_state',
        { pid: lab.pid, window_id: target.window_id, include_screenshot: false },
        context,
      );
      const elements = findElementRecords(state, 'window');
      console.info('LAB AX', JSON.stringify(state).slice(0, 6000));
      expect(
        elements.length,
        'The lab must expose accessibility content before running model tasks',
      ).toBeGreaterThan(0);
    } finally {
      await driver.shutdown();
    }
  },
  90_000,
);
