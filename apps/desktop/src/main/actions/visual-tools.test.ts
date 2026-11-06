import { expect, it } from 'vitest';
import { ACTION_TOOL_DESCRIPTORS, parseActionArguments } from '@sia/action-gateway';
import { visualTools } from './visual-tools.js';

it('projects visual contracts without modifying canonical descriptors or offering assisted routes', () => {
  const before = JSON.stringify(ACTION_TOOL_DESCRIPTORS);
  const tools = visualTools(ACTION_TOOL_DESCRIPTORS);
  expect(tools.map((tool) => tool.name)).not.toContain('mac_automation');
  expect(tools.map((tool) => tool.name)).not.toContain('browser_upload');
  for (const name of [
    'computer_snapshot',
    'browser_snapshot',
    'computer_action',
    'browser_action',
  ]) {
    const tool = tools.find((tool) => tool.name === name)!;
    const schema = JSON.stringify(tool.inputSchema);
    for (const hidden of [
      'element_ref',
      'read_text',
      'read_links',
      'continue_from',
      'tabs_only',
      'target_role',
      'menu_path',
      'include_image',
      'replace',
    ])
      expect(schema).not.toContain(`"${hidden}"`);
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(Object.values(tool.inputSchema.properties as object)).not.toContain(undefined);
    if (name.endsWith('_action')) {
      const props = tool.inputSchema.properties as Record<string, { enum?: string[] }>;
      expect(props.action?.enum).not.toContain('set');
      expect(props.action?.enum).not.toContain('menu');
    }
  }
  // Explicit file tools keep their ordinary contract; they are not UI fallbacks.
  expect(tools.find((tool) => tool.name === 'computer_write_file')).toBe(
    ACTION_TOOL_DESCRIPTORS.find((tool) => tool.name === 'computer_write_file'),
  );
  expect(JSON.stringify(ACTION_TOOL_DESCRIPTORS)).toBe(before);
  expect(() =>
    parseActionArguments('computer_action', {
      app_id: 'app',
      window_id: 'window',
      snapshot_id: 'snapshot',
      action: 'key',
      value: 'Tab',
    }),
  ).not.toThrow();
  expect(() =>
    parseActionArguments('browser_action', {
      origin: 'https://example.com',
      tab_id: 'tab',
      snapshot_id: 'snapshot',
      action: 'click',
      x: 10,
      y: 20,
    }),
  ).not.toThrow();
});
