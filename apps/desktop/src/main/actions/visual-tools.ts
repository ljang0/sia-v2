import type { ToolDescriptor } from '@sia/protocol';

// A projection of the canonical tool contracts, not a second execution surface.
// Host validation still rejects assisted arguments even if a caller ignores this schema.
const fields: Readonly<Record<string, readonly string[]>> = {
  computer_snapshot: ['app_id', 'window_id', 'tab_id', 'expected_url', 'wait_ms'],
  browser_snapshot: ['tab_id'],
  computer_action: [
    'app_id',
    'window_id',
    'snapshot_id',
    'action',
    'x',
    'y',
    'to_x',
    'to_y',
    'button',
    'count',
    'delivery',
    'text',
    'value',
    'modifiers',
    'direction',
    'amount',
  ],
  browser_action: [
    'tab_id',
    'snapshot_id',
    'action',
    'x',
    'y',
    'to_x',
    'to_y',
    'button',
    'count',
    'text',
    'value',
    'modifiers',
    'direction',
    'amount',
    'origin',
    'private',
  ],
};

export function visualTools(tools: readonly ToolDescriptor[]): ToolDescriptor[] {
  return tools
    .filter((tool) => !['mac_automation', 'browser_upload'].includes(tool.name))
    .map((tool) => {
      const source = tool.inputSchema.properties as Readonly<Record<string, unknown>>;
      const opening = tool.name === 'computer_open_app' || tool.name === 'computer_open_url';
      const selected = fields[tool.name] ?? (opening ? Object.keys(source) : undefined);
      if (!selected) return tool;
      const properties = Object.fromEntries(selected.map((name) => [name, source[name]]));
      const snapshot = tool.name.endsWith('_snapshot');
      if (!snapshot && !opening) {
        properties.action = {
          type: 'string',
          enum: ['click', 'type', 'scroll', 'key', 'drag'],
        };
        for (const coordinate of ['x', 'y'])
          properties[coordinate] = {
            ...(source[coordinate] as Record<string, unknown>),
            description:
              'Required for click, scroll and drag: a point inside the intended area in original screenshot pixels. Browser type/key use the visually focused control without coordinates.',
          };
        properties.text = {
          type: 'string',
          description: 'Literal text to insert at the visually focused caret.',
        };
        properties.count = {
          type: 'integer',
          minimum: 1,
          maximum: 2,
          description: 'Single or double click at the screenshot point.',
        };
        properties.amount = {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          description:
            'Scroll amount; native windows use line repetitions (capped at 50), browser windows use pixels.',
        };
      }
      if ('delivery' in properties)
        properties.delivery = {
          type: 'string',
          enum: ['background', 'foreground'],
          description:
            'Defaults to the selected Mac control mode; explicit delivery remains subject to the host foreground policy.',
        };
      return {
        ...tool,
        description: opening
          ? tool.name === 'computer_open_app'
            ? 'Open a permitted installed application. Delivery follows the selected Mac mode. Inspect its window afterward; opening does not grant input or prove document contents.'
            : 'Open an ordinary HTTP(S) website. In background mode pass the exact granted Chromium app/window and optional task tab. prepare_only discovers existing tabs and restores that connection without navigation or foregrounding. Select the intended task tab from the returned choices; never replace an unrelated tab. On screen uses the system opener; observe and verify the resulting window before input. Never use navigation to bypass a protected surface.'
          : snapshot
            ? 'Capture a fresh screenshot of the exact granted window or tab. Inspect the image; no extracted text or semantic targets are provided. A failed capture grants no input.'
            : 'Send one screenshot-coordinate pointer action, literal text, or named key to the exact observed window or tab. Use its latest snapshot_id and original image coordinates. Click, scroll and drag require both x and y; scrolling also requires direction, and dragging requires to_x/to_y. Inspect the returned image before the next action; never replay uncertain input.' +
              (tool.name === 'computer_action'
                ? ' For a native key action, x/y focuses the chosen field before the key or shortcut in one operation. Omit x/y only when the intended control already has keyboard focus.'
                : ''),
        inputSchema: { ...tool.inputSchema, properties },
      };
    });
}
