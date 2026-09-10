import { describe, expect, it } from 'vitest';
import { MAC_EXECUTION_TOOLS, macExecutionTools, parseMacResponse } from './mac-execution.js';

describe('Notch response port', () => {
  it('reads fenced JSON with escaped quotes and braces without speaking the envelope', () => {
    const response = 'Created "Example {one}".';
    expect(
      parseMacResponse(
        '```json\n' +
          JSON.stringify({
            type: 'action',
            response,
            success: true,
            output_file: '/tmp/Example one.txt',
          }) +
          '\n```',
      ),
    ).toEqual({ response, output_file: '/tmp/Example one.txt' });
  });
  it('does not turn incomplete output or arbitrary JSON into claimed success', () => {
    for (const text of [
      '',
      '{"response":',
      '{"response":"Done"}',
      '{"type":"action","response":"","success":true}',
      'A normal conversational update.',
    ])
      expect(parseMacResponse(text)).toBeUndefined();
  });
  it('adds window control only when explicitly selected while keeping the old checklist, connections and restricted script runner out of Mac execution', () => {
    expect(
      MAC_EXECUTION_TOOLS.some((name) =>
        /^(computer_task_complete|browser_|mac_automation|skill_run)/.test(name),
      ),
    ).toBe(false);
    expect(MAC_EXECUTION_TOOLS).toContain('assistant_library');
    expect(MAC_EXECUTION_TOOLS).not.toContain('computer_list');
    expect(macExecutionTools(true)).toEqual(
      expect.arrayContaining(['computer_list', 'computer_snapshot', 'computer_action']),
    );
  });
});
