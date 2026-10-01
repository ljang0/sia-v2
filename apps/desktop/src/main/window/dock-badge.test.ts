import { describe, expect, it } from 'vitest';
import { dockBadgeText } from './dock-badge';

describe('dockBadgeText', () => {
  it('is empty when nothing needs the person', () => {
    expect(dockBadgeText([])).toBe('');
    expect(dockBadgeText([{ status: 'idle' }, { status: 'running' }])).toBe('');
  });

  it('counts unread replies and tasks waiting on the person once each', () => {
    expect(
      dockBadgeText([
        { status: 'idle', unread: true },
        { status: 'waiting' },
        { status: 'waiting', unread: true },
        { status: 'running' },
      ]),
    ).toBe('3');
  });

  it('ignores archived conversations and caps long counts', () => {
    expect(dockBadgeText([{ status: 'waiting', archivedAt: '2026-09-01' }])).toBe('');
    expect(
      dockBadgeText(
        Array.from({ length: 120 }, () => ({ status: 'idle' as const, unread: true })),
      ),
    ).toBe('99+');
  });
});
