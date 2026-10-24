import { readFile } from 'node:fs/promises';
import type { CuaAuthorizationContext, CuaService } from '../../mac/cua-service.js';
import { isCuaCallResult } from '../../mac/cua-service.js';
import { asRecord, findElementRecords, findRecordArray } from '../driver-records.js';
import type { LabState, ReliabilityCase } from './types.js';

/** Restricts the real bundled driver to a single disposable app process. */
export class BackgroundTaskLab {
  readonly observed = new Set<string>();
  readonly forbidden: string[] = [];
  readonly driverCalls: { name: string; ms: number; shape?: unknown }[] = [];
  readonly authorization: { adapter: string; risk: string; decision: string }[] = [];
  private injected = false;
  private controls = new Map<string, string>();
  private scenario: ReliabilityCase | undefined;
  get faultInjected(): boolean {
    return this.injected;
  }
  private constructor(
    readonly pid: number,
    private readonly origin: string,
    private readonly token: string,
  ) {}

  static async connect(configFile: string): Promise<BackgroundTaskLab> {
    const config = JSON.parse(await readFile(configFile, 'utf8')) as {
      token: string;
      readyFile: string;
      pid: number;
    };
    const ready = JSON.parse(await readFile(config.readyFile, 'utf8')) as {
      pid: number;
      port: number;
    };
    if (ready.pid !== config.pid) throw new Error('The disposable lab process changed.');
    return new BackgroundTaskLab(ready.pid, `http://127.0.0.1:${ready.port}`, config.token);
  }

  async reset(scenario: ReliabilityCase): Promise<void> {
    this.scenario = scenario;
    this.observed.clear();
    this.forbidden.length = 0;
    this.driverCalls.length = 0;
    this.authorization.length = 0;
    this.controls.clear();
    this.injected = false;
    const response = await fetch(`${this.origin}/__control`, {
      method: 'POST',
      headers: { 'x-sia-lab': this.token },
      body: JSON.stringify(scenario.app),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Could not reset the disposable app.');
  }

  async state(): Promise<LabState> {
    const response = await fetch(`${this.origin}/__control`, {
      headers: { 'x-sia-lab': this.token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Could not inspect the disposable app.');
    return (await response.json()) as LabState;
  }

  async openUrl(value: string): Promise<void> {
    this.forbidden.push(`open_url:${value}`);
    throw new Error('Use the already open disposable app and its observed links.');
  }

  async call(
    driver: CuaService,
    name: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const allowed = new Set([
      'list_apps',
      'list_windows',
      'get_window_state',
      'click',
      'type_text',
      'set_value',
      'press_key',
      'hotkey',
      'scroll',
      'end_session',
    ]);
    if (
      !allowed.has(name) ||
      args.delivery_mode === 'foreground' ||
      (!['list_apps', 'list_windows', 'end_session'].includes(name) && args.pid !== this.pid)
    ) {
      this.forbidden.push(name);
      throw new Error('Only background input to the disposable lab process is permitted.');
    }
    const label = this.controls.get(String(args.element_token ?? args.element_index));
    const page = this.scenario?.app.pages[(await this.state()).current];
    const committing = name === 'click' && label && page?.buttons?.[label]?.write;
    const input = ['click', 'type_text', 'set_value', 'press_key', 'hotkey', 'scroll'].includes(
      name,
    );
    if (!this.injected && input && this.scenario?.fault === 'stale_once') {
      this.injected = true;
      return { error_code: 'stale_snapshot' };
    }
    if (!this.injected && committing && this.scenario?.fault === 'noop_once') {
      this.injected = true;
      return { effect: 'suspected_noop', delivery: { mode: 'background' } };
    }
    if (
      !this.injected &&
      name === 'get_window_state' &&
      this.scenario?.fault === 'capture_once'
    ) {
      this.injected = true;
      return { error_code: 'px_capture_unavailable' };
    }
    const started = Date.now();
    const raw = await driver.call(name, args, context, signal);
    this.driverCalls.push({ name, ms: Date.now() - started });
    if (committing && !this.injected && this.scenario?.fault === 'lost_ack_once') {
      this.injected = true;
      throw new Error('Timed out waiting for input acknowledgement; delivery is unknown.');
    }
    if (name === 'list_apps' || name === 'list_windows') {
      const key = name === 'list_apps' ? 'apps' : 'windows';
      this.driverCalls.at(-1)!.shape = {
        keys: Object.keys(asRecord(raw) ?? {}),
        entries: findRecordArray(raw, key).length,
        own: findRecordArray(raw, key).filter((item) => item.pid === this.pid).length,
        status: asRecord(raw)?.status,
        code: asRecord(raw)?.error_code,
      };
      const value = {
        [key]: findRecordArray(raw, key).filter((item) => item.pid === this.pid),
      };
      return isCuaCallResult(raw) ? { value, images: [] } : value;
    }
    if (name === 'get_window_state') {
      if (!asRecord(raw)?.error_code) this.observed.add((await this.state()).current);
      this.controls.clear();
      for (const element of findElementRecords(raw, 'window')) {
        const key = element.element_token ?? element.element_index;
        const label = element.label ?? element.title ?? element.name;
        if (key !== undefined && typeof label === 'string')
          this.controls.set(String(key), label);
      }
    }
    return raw;
  }
}
