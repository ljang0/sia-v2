import type { CuaAuthorizationContext, CuaService } from '../../mac/cua-service.js';
import type { LabDefinition, LabState, ReliabilityCase } from './types.js';
import { findRecordArray } from '../driver-records.js';

/** Model/host regression seam, explicitly not evidence of native macOS input delivery. */
export class SimulatedTaskLab {
  readonly pid = 4242;
  readonly observed = new Set<string>();
  readonly forbidden: string[] = [];
  readonly driverCalls: { name: string; ms: number }[] = [];
  readonly authorization: { adapter: string; risk: string; decision: string }[] = [];
  private definition: LabDefinition = { start: '/', pages: {} };
  private current = '/';
  private writes: LabState['writes'] = [];
  private revision = 0;
  private controls = new Map<string, { kind: string; label: string; path?: string }>();
  private values = new Map<string, Record<string, string>>();
  private focused: string | undefined;
  private replace = false;
  private fault: ReliabilityCase['fault'];
  private injected = false;
  get faultInjected(): boolean {
    return this.injected;
  }

  async reset(scenario: ReliabilityCase): Promise<void> {
    this.definition = structuredClone(scenario.app);
    this.current = this.definition.start;
    this.writes = [];
    this.revision = 0;
    this.focused = undefined;
    this.replace = false;
    this.controls.clear();
    this.values.clear();
    this.observed.clear();
    this.forbidden.length = 0;
    this.driverCalls.length = 0;
    this.authorization.length = 0;
    this.fault = scenario.fault;
    this.injected = false;
    for (const [path, page] of Object.entries(this.definition.pages))
      this.values.set(path, { ...page.fields });
  }
  async state(): Promise<LabState> {
    return {
      pid: this.pid,
      current: this.current,
      writes: structuredClone(this.writes),
      visits: [...this.observed],
    };
  }
  async openUrl(url: string): Promise<void> {
    this.forbidden.push(`open_url:${url}`);
    throw new Error('Only observed fixture links are available.');
  }
  createDriver() {
    return {
      callTool: async (name: string, json: string) => ({
        rawJson: JSON.stringify(
          await this.perform(name, JSON.parse(json) as Record<string, unknown>),
        ),
      }),
      shutdown: async () => undefined,
    };
  }
  async call(
    driver: CuaService,
    name: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (
      args.delivery_mode === 'foreground' ||
      (args.pid !== undefined && args.pid !== this.pid)
    ) {
      this.forbidden.push(name);
      throw new Error('Only the background fixture is available.');
    }
    const started = Date.now();
    try {
      const raw = await driver.call(name, args, context, signal);
      if (name === 'list_apps' || name === 'list_windows') {
        const key = name === 'list_apps' ? 'apps' : 'windows';
        const records = findRecordArray(raw, key);
        if (records.some((item) => item.pid !== this.pid))
          throw new Error('A simulated run must never use a native driver inventory.');
      }
      return raw;
    } finally {
      this.driverCalls.push({ name, ms: Date.now() - started });
    }
  }
  private async perform(name: string, args: Record<string, unknown>): Promise<unknown> {
    const page = this.definition.pages[this.current]!;
    if (name === 'list_apps')
      return {
        apps: [{ pid: this.pid, name: 'Task Lab', bundle_id: 'local.fixture.tasklab' }],
      };
    if (name === 'list_windows')
      return {
        windows: [
          {
            pid: this.pid,
            window_id: 91,
            app_name: 'Task Lab',
            title: page.title,
            is_on_screen: true,
            on_current_space: true,
          },
        ],
      };
    if (name === 'end_session') return {};
    if (name === 'get_window_state') {
      if (!this.injected && this.fault === 'capture_once') {
        this.injected = true;
        return { error_code: 'px_capture_unavailable' };
      }
      this.revision++;
      this.controls.clear();
      this.observed.add(this.current);
      const elements: Record<string, unknown>[] = [
        { role: 'AXStaticText', value: page.text },
        { role: 'AXStaticText', value: `Saved changes: ${JSON.stringify(this.writes)}` },
      ];
      const add = (
        kind: string,
        label: string,
        role: string,
        value?: string,
        path?: string,
      ) => {
        const token = `fixture:${this.revision}:${elements.length}`;
        this.controls.set(token, { kind, label, ...(path ? { path } : {}) });
        elements.push({
          role,
          label,
          ...(value === undefined ? {} : { value }),
          element_token: token,
          element_index: elements.length,
        });
      };
      for (const [label, path] of Object.entries(page.links ?? {}))
        add('link', label, 'AXLink', undefined, path);
      for (const [label, value] of Object.entries(this.values.get(this.current) ?? {}))
        add('field', label, label === 'Body' ? 'AXTextArea' : 'AXTextField', value);
      for (const label of Object.keys(page.buttons ?? {})) add('button', label, 'AXButton');
      return {
        snapshot_id: `fixture-snapshot-${this.revision}`,
        elements,
        elements_complete: true,
        background_input: {
          exact_window: { pid: this.pid, window_id: 91, status: 'matched' },
          routes: ['accessibility', 'window_pointer', 'pid_keyboard'].map((route) => ({
            route,
            status: 'available',
          })),
        },
      };
    }
    const input = ['click', 'set_value', 'type_text', 'press_key', 'hotkey', 'scroll'].includes(
      name,
    );
    if (!input) {
      this.forbidden.push(name);
      throw new Error(`Unsupported fixture action: ${name}`);
    }
    if (!this.injected && this.fault === 'stale_once') {
      this.injected = true;
      return { error_code: 'stale_snapshot' };
    }
    if (args.element_token && args.snapshot_id !== `fixture-snapshot-${this.revision}`)
      return { error_code: 'stale_snapshot' };
    const control = this.controls.get(String(args.element_token));
    const effect = { effect: 'confirmed', delivery: { mode: 'background' } };
    if (name === 'click') {
      if (!control) return { error_code: 'invalid_element' };
      if (control.kind === 'link') {
        this.current = control.path!;
        this.focused = undefined;
      } else if (control.kind === 'field') this.focused = control.label;
      else {
        const button = page.buttons![control.label]!;
        if (button.write && !this.injected && this.fault === 'noop_once') {
          this.injected = true;
          return { effect: 'suspected_noop', delivery: { mode: 'background' } };
        }
        if (button.write)
          this.writes.push({ id: button.write, values: { ...this.values.get(this.current) } });
        if (button.goto) this.current = button.goto;
        if (button.write && !this.injected && this.fault === 'lost_ack_once') {
          this.injected = true;
          throw new Error('Timed out waiting for input acknowledgement; delivery is unknown.');
        }
      }
    } else if (name === 'set_value' || name === 'type_text') {
      const label = control?.kind === 'field' ? control.label : this.focused;
      if (!label) return { error_code: 'no_focused_field' };
      const values = this.values.get(this.current)!;
      const text = String(args.value ?? args.text ?? '');
      values[label] =
        name === 'set_value' || this.replace ? text : (values[label] ?? '') + text;
      this.focused = label;
      this.replace = false;
    } else if (name === 'hotkey') {
      const keys = args.keys as string[];
      if (keys.includes('a') && keys.includes('cmd')) this.replace = true;
    }
    return effect;
  }
}
