// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchBatchSummary } from '../../types';
import { ResearchArchiveSettings } from './ResearchArchiveSettings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('raw research archive', () => {
  it('lists invitations and sends a normalized participant invite', async () => {
    const createInvite = vi.fn(async (email: string) => ({
      email,
      invitedAt: '2026-08-24T02:00:00.000Z',
      status: 'invited' as const,
    }));

    render(
      <ResearchArchiveSettings
        listInvites={async () => ({
          invites: [
            {
              email: 'existing@example.edu',
              invitedAt: '2026-08-23T02:00:00.000Z',
              status: 'active',
            },
          ],
          limit: 20,
        })}
        createInvite={createInvite}
        listParticipants={async () => []}
        listBatches={async () => []}
        readBatch={async () => undefined}
      />,
    );

    expect(await screen.findByText(/existing@example\.edu/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: '  NEW.PERSON@EXAMPLE.EDU  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(createInvite).toHaveBeenCalledWith('new.person@example.edu'));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Invitation sent to new.person@example.edu.',
    );
  });

  it('groups raw bundles by turn and reconstructs ordered chunked events', async () => {
    const batches: ResearchBatchSummary[] = [
      rawBatch('batch-1', 0, 1, ['provider.message']),
      rawBatch('batch-2', 2, 2, ['sia.action_result']),
    ];
    const chunked = Buffer.from(
      JSON.stringify({ outcome: 'verified', output: 'large raw output' }),
      'utf8',
    );
    const splitAt = 18;
    const readBatch = vi.fn(async (_subject: string, batchId: string) => {
      if (batchId === 'batch-1') {
        return {
          events: [
            rawEvent('event-1', 'provider.message', 0, {
              role: 'user',
              text: 'check the web every hour',
            }),
            rawChunk(
              'chunk-1',
              'action-event',
              'sia.action_result',
              2,
              0,
              2,
              chunked.subarray(0, splitAt),
            ),
          ],
        };
      }
      return {
        events: [
          rawChunk(
            'chunk-2',
            'action-event',
            'sia.action_result',
            2,
            1,
            2,
            chunked.subarray(splitAt),
          ),
        ],
      };
    });
    const listParticipants = vi.fn(async () => [
      {
        subject: 'participant-1',
        email: 'researcher@example.com',
        batchCount: 2,
        byteLength: 4_096,
        lastCreatedAt: '2026-08-21T03:00:02.000Z',
      },
    ]);
    const listBatches = vi.fn(async () => batches);

    render(
      <ResearchArchiveSettings
        listInvites={async () => ({ invites: [], limit: 20 })}
        createInvite={async () => {
          throw new Error('not used');
        }}
        listParticipants={listParticipants}
        listBatches={listBatches}
        readBatch={readBatch}
      />,
    );

    expect(await screen.findByText('researcher@example.com')).toBeTruthy();
    await waitFor(() => expect(listBatches).toHaveBeenCalledWith('participant-1'));
    fireEvent.click(await screen.findByRole('button', { name: /turn-123/ }));

    await waitFor(() => expect(readBatch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('provider.message')).toBeTruthy();
    expect(screen.getByText('sia.action_result')).toBeTruthy();
    expect(screen.getByText(/check the web every hour/)).toBeTruthy();
    expect(screen.getByText(/large raw output/)).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter raw events' }), {
      target: { value: 'action_result' },
    });
    expect(screen.queryByText('provider.message')).toBeNull();
    expect(screen.getByText('sia.action_result')).toBeTruthy();
  });

  it('shows an integrity event instead of silently dropping an incomplete chunked event', async () => {
    render(
      <ResearchArchiveSettings
        listInvites={async () => ({ invites: [], limit: 20 })}
        createInvite={async () => {
          throw new Error('not used');
        }}
        listParticipants={async () => [
          {
            subject: 'participant-1',
            batchCount: 1,
            byteLength: 2_048,
            lastCreatedAt: '2026-08-21T03:00:02.000Z',
          },
        ]}
        listBatches={async () => [rawBatch('batch-1', 2, 2, ['sia.action_result'])]}
        readBatch={async () => ({
          events: [
            rawChunk(
              'chunk-1',
              'missing-event',
              'sia.action_result',
              2,
              0,
              2,
              Buffer.from('{"partial":'),
            ),
          ],
        })}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /turn-123/ }));
    expect(await screen.findByText('archive.integrity_error')).toBeTruthy();
    expect(screen.getByText(/incomplete and was not reconstructed/)).toBeTruthy();
  });
});

function rawBatch(
  batchId: string,
  sequenceStart: number,
  sequenceEnd: number,
  eventKinds: string[],
): ResearchBatchSummary {
  return {
    batchId,
    consentVersion: 'alpha-research-v3-raw',
    eventCount: 1,
    sha256: `${batchId}-sha`,
    byteLength: 2_048,
    createdAt: `2026-08-21T03:00:0${sequenceEnd}.000Z`,
    format: 'raw_v1',
    scope: {
      threadId: 'thread-123',
      turnId: 'turn-123',
      sequenceStart,
      sequenceEnd,
      eventKinds,
    },
  };
}

function rawEvent(id: string, eventType: string, sequence: number, data: unknown) {
  return {
    id,
    occurredAt: `2026-08-21T03:00:0${sequence}.000Z`,
    kind: 'raw.event',
    payload: { eventType, sequence, data },
  };
}

function rawChunk(
  id: string,
  eventId: string,
  eventType: string,
  sequence: number,
  chunkIndex: number,
  chunkCount: number,
  bytes: Uint8Array,
) {
  return {
    id,
    occurredAt: '2026-08-21T03:00:02.000Z',
    kind: 'raw.event_chunk',
    payload: {
      eventId,
      eventType,
      sequence,
      chunkIndex,
      chunkCount,
      chunkData: Buffer.from(bytes).toString('base64'),
    },
  };
}
