// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityRow } from './ActivityRow';
import { StatusMark } from './StatusMark';

afterEach(cleanup);

describe('status accessibility', () => {
  it('names icon-only thread and activity states for assistive technology', () => {
    render(
      <>
        <StatusMark status="waiting" />
        <ActivityRow
          event={{
            id: 'activity-1',
            type: 'activity',
            kind: 'browser',
            title: 'Opening the granted site',
            status: 'queued',
            timestamp: '2026-08-13T00:00:00.000Z',
          }}
        />
      </>,
    );

    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.getByText('Status: queued')).toBeTruthy();
  });

  it('reveals structured command output without adding another permanent panel', () => {
    render(
      <ActivityRow
        event={{
          id: 'command-1',
          type: 'activity',
          kind: 'command',
          title: 'pnpm test',
          status: 'complete',
          timestamp: '2026-08-13T00:00:00.000Z',
          presentation: {
            kind: 'command',
            command: 'pnpm test',
            cwd: '/tmp/workspace',
            output: '20 passed',
            exitCode: 0,
            durationMs: 912,
          },
        }}
      />,
    );

    // The finished row names the step and its command before it is expanded.
    expect(screen.getByRole('button', { name: /Ran a command\s*pnpm test/i })).toBeTruthy();
    expect(screen.queryByText('20 passed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ran a command/i }));
    expect(screen.getAllByText('pnpm test').length).toBeGreaterThan(1);
    expect(screen.getByText('/tmp/workspace')).toBeTruthy();
    expect(screen.getByText('20 passed')).toBeTruthy();
    expect(screen.getByText('Finished · 912 ms')).toBeTruthy();
  });
});
