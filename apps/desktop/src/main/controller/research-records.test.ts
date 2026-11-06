import { expect, it } from 'vitest';
import { summarizeRawEpisode, type RawResearchEventRecord } from './research-records.js';

function event(id: string, eventType: string, data: unknown): RawResearchEventRecord {
  return {
    id,
    occurredAt: '2026-10-31T12:00:00Z',
    classification: 'research_allowed',
    taints: [],
    sourceEventIds: [],
    kind: 'raw.event',
    payload: { schemaVersion: 1, threadId: 'thread', turnId: 'turn', eventType, data },
  };
}

it('keeps browser, native and file tool evidence distinct without claiming task verification', () => {
  const result = { images: [{ mimeType: 'image/png', dataBase64: 'fixture' }] };
  const summary = summarizeRawEpisode([
    event('start', 'episode.started', { computerControlMode: 'vision' }),
    event('native', 'sia.action_result', { name: 'computer_snapshot', result }),
    event('browser', 'sia.action_result', { name: 'browser_snapshot', result }),
    event('input', 'sia.action_result', {
      name: 'browser_action',
      result: { outcome: 'refused' },
    }),
    event('file', 'sia.action_result', {
      name: 'computer_write_file',
      result: { outcome: 'verified' },
    }),
  ]);
  expect(summary).toMatchObject({
    configuredComputerControlMode: 'vision',
    gatewayActions: 4,
    gatewayActionsByTool: {
      computer_snapshot: 1,
      browser_snapshot: 1,
      browser_action: 1,
      computer_write_file: 1,
    },
    computerSnapshots: 1,
    computerActions: 0,
    computerImages: 1,
    browserSnapshots: 1,
    browserActions: 1,
    browserImages: 1,
    independentTaskVerification: 'not_available',
    privilegedInitialAndFinalState: 'not_captured',
  });
  expect(summary.eventDigestSha256).toMatch(/^[a-f0-9]{64}$/);
});

it('does not relabel historical or file-only evidence as vision completion', () => {
  const summary = summarizeRawEpisode([
    event('start', 'episode.started', { route: 'mac_background_cua' }),
    event('file', 'sia.action_result', {
      name: 'computer_write_file',
      result: { outcome: 'verified' },
    }),
  ]);
  expect(summary).toMatchObject({
    configuredComputerControlMode: 'unknown',
    computerImages: 0,
    browserImages: 0,
    independentTaskVerification: 'not_available',
  });
});
