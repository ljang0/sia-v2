import { describe, expect, it } from 'vitest';
import type { ConnectionView } from '../../shared/bridge.js';
import { INITIAL_STATE, recoverPersistedState } from './persisted-state.js';

describe('recoverPersistedState connections', () => {
  it('does not turn a pending file edit into a completed change after relaunch', () => {
    const state = structuredClone(INITIAL_STATE);
    for (const [index, status] of ['running', 'complete'].entries()) {
      state.timeline.push({
        id: `file-${index}`,
        threadId: 'thread-1',
        turnId: 'turn-1',
        kind: 'activity',
        sequence: index,
        status: status as 'running' | 'complete',
        toolName: 'fileChange',
        timestamp: new Date().toISOString(),
        activity: {
          kind: 'file_change',
          files: [{ path: `/tmp/file-${index}`, change: 'add' }],
        },
      });
    }
    expect(recoverPersistedState(state).timeline.map((item) => item.status)).toEqual([
      'failed',
      'complete',
    ]);
  });

  it('gives a saved Google Workspace grant its Calendar and Tasks rows', () => {
    const grant = {
      status: 'connected' as const,
      connectionId: 'gw_grant',
      account: 'me@example.com',
      googleAccess: 'read_only' as const,
    };
    const saved: ConnectionView[] = [
      { id: 'gmail', label: 'Gmail', ...grant },
      { id: 'drive', label: 'Google Drive', ...grant },
      { id: 'docs', label: 'Google Docs', ...grant },
      { id: 'sheets', label: 'Google Sheets', ...grant },
      { id: 'slides', label: 'Google Slides', ...grant },
      { id: 'slack', label: 'Slack', status: 'disconnected' },
    ];
    const recovered = recoverPersistedState(
      structuredClone({
        ...INITIAL_STATE,
        connections: saved,
        connectionOwners: { gmail: 'me@example.com' },
      }),
    );
    expect(recovered.connections.map(({ id }) => id)).toEqual([
      'gmail',
      'calendar',
      'drive',
      'docs',
      'sheets',
      'slides',
      'tasks',
      'slack',
      'outlook',
      'notion',
      'github',
    ]);
    for (const id of ['calendar', 'tasks'] as const) {
      expect(recovered.connections.find((connection) => connection.id === id)).toMatchObject(
        grant,
      );
      expect(recovered.connectionOwners[id]).toBe('me@example.com');
    }
    expect(recovered.connections.find(({ id }) => id === 'outlook')).toMatchObject({
      status: 'disconnected',
    });
  });

  it('leaves Calendar and Tasks disconnected without a Workspace grant', () => {
    const recovered = recoverPersistedState(
      structuredClone({
        ...INITIAL_STATE,
        connections: [{ id: 'gmail', label: 'Gmail', status: 'disconnected' }],
      }),
    );
    expect(recovered.connections.find(({ id }) => id === 'calendar')).toMatchObject({
      status: 'disconnected',
    });
  });

  it('resets a Mac sign-in that was waiting in the browser when Sia quit', () => {
    const recovered = recoverPersistedState(
      structuredClone({
        ...INITIAL_STATE,
        connections: [
          {
            id: 'github',
            label: 'GitHub',
            status: 'connecting',
            userCode: 'ABCD-1234',
            detail: 'Enter code ABCD-1234 on the GitHub page that opened in your browser.',
          },
        ],
      }),
    );
    expect(recovered.connections.find(({ id }) => id === 'github')).toEqual({
      id: 'github',
      label: 'GitHub',
      status: 'disconnected',
    });
  });
});
