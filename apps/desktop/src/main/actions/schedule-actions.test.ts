import type { ValidatedActionInvocation } from '@sia/action-gateway';
import { describe, expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { fakeCua, request } from './test-support.js';

describe('DesktopActionBackend schedule boundary', () => {
  it('creates, lists, updates, and deletes only through the controller-owned host', async () => {
    const schedules = {
      create: vi.fn(() => ({ id: 'schedule-1', cadence: 'hourly' })),
      list: vi.fn(() => [{ id: 'schedule-1', cadence: 'hourly' }]),
      update: vi.fn(() => ({ id: 'schedule-1', enabled: false })),
      delete: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      schedules,
    });

    await expect(
      backend.invoke(
        request('schedule_create', {
          task: 'Search the web and report changes.',
          cadence: 'hourly',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'verified',
      data: { schedule: { id: 'schedule-1' } },
    });
    await expect(backend.invoke(request('schedule_list', {}))).resolves.toMatchObject({
      outcome: 'verified',
      data: { schedules: [{ id: 'schedule-1' }] },
    });
    await backend.invoke(
      request('schedule_update', { schedule_id: 'schedule-1', enabled: false }),
    );
    await backend.invoke(
      request('schedule_create', {
        task: 'Recap my week.',
        cadence: 'weekly',
        days: ['monday', 'friday'],
      }),
    );
    await backend.invoke(
      request('schedule_update', {
        schedule_id: 'schedule-1',
        cadence: 'hourly',
        every_hours: 3,
      }),
    );
    await backend.invoke(request('schedule_delete', { schedule_id: 'schedule-1' }));

    expect(schedules.create).toHaveBeenCalledWith('thread-1', {
      task: 'Search the web and report changes.',
      cadence: 'hourly',
    });
    expect(schedules.list).toHaveBeenCalledWith('thread-1');
    expect(schedules.update).toHaveBeenCalledWith('thread-1', {
      scheduleId: 'schedule-1',
      enabled: false,
    });
    expect(schedules.create).toHaveBeenCalledWith('thread-1', {
      task: 'Recap my week.',
      cadence: 'weekly',
      days: [1, 5],
    });
    expect(schedules.update).toHaveBeenCalledWith('thread-1', {
      scheduleId: 'schedule-1',
      cadence: 'hourly',
      everyHours: 3,
    });
    expect(schedules.delete).toHaveBeenCalledWith('thread-1', 'schedule-1');
  });

  it('fails closed when a schedule mutation reaches the backend without authorization', async () => {
    const schedules = {
      create: vi.fn(),
      list: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      schedules,
    });
    const invocation = request('schedule_create', {
      task: 'Check every hour.',
      cadence: 'hourly',
    });
    const unapproved: ValidatedActionInvocation = {
      name: invocation.name,
      arguments: invocation.arguments,
      descriptor: invocation.descriptor,
      context: invocation.context,
    };

    await expect(backend.invoke(unapproved)).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringMatching(/authorization/i),
    });
    expect(schedules.create).not.toHaveBeenCalled();
  });
});
