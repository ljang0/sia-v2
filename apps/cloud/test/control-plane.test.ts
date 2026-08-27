import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppId, AuthContext, ResearchBatchRequest, ToolName } from '../src/contracts.js';
import { COMPOSIO_TOOL_SLUGS, COMPOSIO_TOOL_VERSIONS } from '../src/connector-contract.js';
import { CloudError } from '../src/domain.js';
import {
  EchoMetaProvider,
  FixedClock,
  FixedSecrets,
  MemoryAudit,
  MemoryConnector,
  MemoryDeletionQueue,
  MemoryIdentity,
  MemoryQuota,
  MemoryReleaseManifests,
  MemoryResearchObjects,
  MemoryResearchExportQueue,
  MemoryState,
  MemoryVoiceProvider,
  SequenceIds,
} from '../src/memory.js';
import { ConnectorReconnectRequiredError } from '../src/ports.js';
import type { ComposioConfig, MetaConfig } from '../src/ports.js';
import { createServices, type ServiceDependencies } from '../src/services.js';

const user: AuthContext = {
  subject: 'user-1',
  email: 'user@example.com',
  groups: ['Participants', 'ConnectorTesters'],
};
const otherUser: AuthContext = {
  subject: 'user-2',
  email: 'other@example.com',
  groups: ['Participants', 'ConnectorTesters'],
};
const admin: AuthContext = {
  subject: 'admin-1',
  email: 'admin@example.com',
  groups: ['Admins'],
};

const participant: AuthContext = {
  subject: 'participant-1',
  email: 'participant@example.com',
  groups: ['Participants'],
};
const operator: AuthContext = {
  subject: 'operator-1',
  email: 'operator@example.com',
  groups: ['Operators'],
};
const metaTester: AuthContext = {
  subject: 'meta-tester-1',
  email: 'meta-tester@example.com',
  groups: ['MetaTesters'],
};
const baseUser: AuthContext = {
  subject: 'base-user-1',
  email: 'base@example.com',
  groups: ['Users'],
};
const legacyUser: AuthContext = {
  subject: user.subject,
  email: 'user@example.com',
  groups: [],
};

describe('release cohorts', () => {
  it('computes participant and staged feature flags per authenticated identity', () => {
    const fixture = makeFixture();

    assert.deepEqual(fixture.services.session.status(legacyUser), {
      user: false,
      admin: false,
      participant: false,
      account: { subject: 'user-1', email: 'user@example.com' },
      entitlements: {
        base: false,
        hostedModels: false,
        hostedVoice: false,
        research: false,
        connectors: false,
      },
      features: {
        researchUploads: false,
        researchArchive: false,
        connectors: false,
        schedules: false,
      },
    });
    assert.deepEqual(fixture.services.session.status(baseUser), {
      user: true,
      admin: false,
      participant: false,
      account: { subject: 'base-user-1', email: 'base@example.com' },
      entitlements: {
        base: true,
        hostedModels: true,
        hostedVoice: true,
        research: false,
        connectors: false,
      },
      features: {
        researchUploads: false,
        researchArchive: false,
        connectors: false,
        schedules: false,
      },
    });
    assert.equal(fixture.services.session.status(participant).participant, true);
    assert.equal(fixture.services.session.status(participant).features.connectors, false);
    assert.equal(fixture.services.session.status(user).features.connectors, true);
    assert.equal(fixture.services.session.status(operator).user, false);
    assert.equal(fixture.services.session.status(metaTester).user, true);
    assert.equal(fixture.services.session.status(admin).admin, true);
    assert.equal(fixture.services.session.status(admin).features.researchArchive, true);
  });

  it('serves the signed private update manifest only to approved release cohorts', async () => {
    const fixture = makeFixture();
    await assert.rejects(
      fixture.services.releases.latestMac(legacyUser),
      (error: unknown) =>
        error instanceof CloudError && error.code === 'release_access_required',
    );
    assert.equal(
      (await fixture.services.releases.latestMac(operator)).payload.version,
      '0.1.0-alpha.13',
    );
    assert.equal(
      (await fixture.services.releases.latestMac(metaTester)).payload.version,
      '0.1.0-alpha.13',
    );
    const release = await fixture.services.releases.latestMac(participant);
    assert.equal(release.payload.version, '0.1.0-alpha.13');
    assert.match(release.downloadUrl, /^https:\/\/release-download\.invalid\//);
    assert.equal(
      (await fixture.services.releases.latestMac(admin)).keyId,
      'sia-release-2026-01',
    );
  });

  it('enforces cohorts on core and connector operations while leaving cleanup available', async () => {
    const fixture = makeFixture();
    await assert.rejects(
      fixture.services.research.upload(legacyUser, validBatch()),
      hasCode('participant_access_required'),
    );
    await assert.rejects(
      fixture.services.meta.capabilities(legacyUser),
      hasCode('user_access_required'),
    );
    await assert.rejects(
      fixture.services.connections.start(participant, 'slack'),
      hasCode('connector_tester_required'),
    );

    await connect(fixture, 'slack', 'cleanup-connection');
    await assert.doesNotReject(
      fixture.services.connections.disconnect(legacyUser, 'slack', 'cleanup-connection'),
    );
  });
});

describe('connector action gateway', () => {
  it('executes allowlisted reads directly and persists metadata only', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'gmail', 'connection-1');

    const result = await fixture.services.actions.prepare(user, {
      connectionId: 'connection-1',
      tool: 'mail.read_thread',
      input: { resource_id: 'thread-123' },
    });

    assert.equal(result.status, 'executed');
    assert.equal(fixture.connector.executions.length, 1);
    assert.deepEqual(fixture.connector.executions[0]?.input, { thread_id: 'thread-123' });
    assert.equal(fixture.state.actionRecords.size, 0);
    assert.deepEqual(fixture.audit.events[0], {
      userId: 'user-1',
      action: 'connector.read',
      app: 'gmail',
      tool: 'mail.read_thread',
      connectionId: 'connection-1',
      outcome: 'allowed',
      occurredAt: '2026-08-13T00:00:00.000Z',
      opaqueResourceIds: ['opaque-1'],
    });
  });

  it('rejects non-canonical connector input before invoking the provider', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'gmail', 'connection-1');

    await assert.rejects(
      fixture.services.actions.prepare(user, {
        connectionId: 'connection-1',
        tool: 'mail.search',
        input: { query: 'from:me', limit: 20, provider_override: true },
      }),
      hasCode('invalid_connector_input'),
    );
    assert.equal(fixture.connector.executions.length, 0);
  });

  it('fails a stale grant closed and keeps it failed until the user reconnects', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'gmail', 'stale-connection');
    fixture.connector.executeError = new ConnectorReconnectRequiredError();

    await assert.rejects(
      fixture.services.actions.prepare(user, {
        connectionId: 'stale-connection',
        tool: 'mail.search',
        input: { query: 'newer_than:7d', limit: 1 },
      }),
      hasCode('connection_reconnect_required'),
    );

    assert.equal(
      (await fixture.state.getConnection(user.subject, 'stale-connection'))?.status,
      'failed',
    );
    fixture.connector.statuses.set('stale-connection', { status: 'connected' });
    assert.equal(
      (await fixture.services.connections.status(user, 'gmail')).connections[0]?.status,
      'failed',
    );
    assert.equal(fixture.audit.events.at(-1)?.errorCode, 'connection_reconnect_required');
  });

  it('routes bounded Google editor reads and exact writes through their own connections', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'google_docs', 'docs-connection');
    await connect(fixture, 'google_sheets', 'sheets-connection');

    const read = await fixture.services.actions.prepare(user, {
      connectionId: 'docs-connection',
      tool: 'docs.read',
      input: { document_id: 'document-123' },
    });
    assert.equal(read.status, 'executed');
    assert.deepEqual(fixture.connector.executions[0]?.input, {
      document_id: 'document-123',
      include_tables: true,
      include_tabs_content: true,
    });

    const input = {
      spreadsheet_id: 'spreadsheet-123',
      range: 'Forecast!A1:B2',
      values: [
        ['Day', 'High'],
        ['Tuesday', 95],
      ],
      value_input_option: 'USER_ENTERED',
    };
    const prepared = await fixture.services.actions.prepare(user, {
      connectionId: 'sheets-connection',
      tool: 'sheets.update',
      input,
    });
    assert.equal(prepared.status, 'approval_required');
    assert.equal(fixture.connector.executions.length, 1);

    await fixture.services.actions.commit(user, {
      actionId: prepared.actionId,
      digest: prepared.digest,
      input,
    });
    assert.deepEqual(fixture.connector.executions[1]?.input, {
      spreadsheet_id: 'spreadsheet-123',
      range: 'Forecast!A1:B2',
      values: input.values,
      major_dimension: 'ROWS',
      auto_expand_sheet: true,
      value_input_option: 'USER_ENTERED',
      include_values_in_response: false,
    });
  });

  it('authorizes every Google tool family through one Workspace connection', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'google_workspace', 'gw_unified-connection');

    await fixture.services.actions.prepare(user, {
      connectionId: 'gw_unified-connection',
      tool: 'mail.search',
      input: { query: 'newer_than:1d', limit: 5 },
    });
    await fixture.services.actions.prepare(user, {
      connectionId: 'gw_unified-connection',
      tool: 'docs.read',
      input: { document_id: 'document-1' },
    });
    await fixture.services.actions.prepare(user, {
      connectionId: 'gw_unified-connection',
      tool: 'sheets.read',
      input: {
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1:B2',
        start_row: 1,
        end_row: 2,
      },
    });

    assert.deepEqual(
      fixture.connector.executions.map(({ connectionId, tool }) => ({ connectionId, tool })),
      [
        { connectionId: 'gw_unified-connection', tool: 'mail.search' },
        { connectionId: 'gw_unified-connection', tool: 'docs.read' },
        { connectionId: 'gw_unified-connection', tool: 'sheets.read' },
      ],
    );
  });

  it('stores no mutation body and commits only the exact approved input once', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'gmail', 'connection-1');
    const input = {
      to: ['friend@example.com'],
      subject: 'Private subject',
      body: 'Private body that must not be stored in DynamoDB',
    };

    const prepared = await fixture.services.actions.prepare(user, {
      connectionId: 'connection-1',
      tool: 'mail.send',
      input,
    });
    assert.equal(prepared.status, 'approval_required');
    const stored = [...fixture.state.actionRecords.values()][0];
    assert.ok(stored);
    assert.equal(JSON.stringify(stored).includes('Private body'), false);
    assert.deepEqual(stored.inputKeys, ['body', 'subject', 'to']);

    await assert.rejects(
      fixture.services.actions.commit(user, {
        actionId: prepared.actionId,
        digest: prepared.digest,
        input: { ...input, body: 'changed after preview' },
      }),
      hasCode('action_digest_mismatch'),
    );
    assert.equal(fixture.connector.executions.length, 0);

    const committed = await fixture.services.actions.commit(user, {
      actionId: prepared.actionId,
      digest: prepared.digest,
      input,
    });
    assert.equal(committed.status, 'completed');
    assert.equal(fixture.connector.executions.length, 1);
    assert.deepEqual(fixture.connector.executions[0]?.input, {
      recipient_email: 'friend@example.com',
      subject: 'Private subject',
      body: 'Private body that must not be stored in DynamoDB',
      is_html: false,
    });

    const replay = await fixture.services.actions.commit(user, {
      actionId: prepared.actionId,
      digest: prepared.digest,
      input,
    });
    assert.equal(replay.status, 'already_completed');
    assert.equal(fixture.connector.executions.length, 1);
  });

  it('records reconnect-required when a mutation discovers an expired grant', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'google_docs', 'expired-docs-connection');
    const input = { title: 'Fixture', markdown: 'read-back' };
    const prepared = await fixture.services.actions.prepare(user, {
      connectionId: 'expired-docs-connection',
      tool: 'docs.create',
      input,
    });
    assert.equal(prepared.status, 'approval_required');
    fixture.connector.executeError = new ConnectorReconnectRequiredError();

    await assert.rejects(
      fixture.services.actions.commit(user, {
        actionId: prepared.actionId,
        digest: prepared.digest,
        input,
      }),
      hasCode('connection_reconnect_required'),
    );

    assert.equal(
      (await fixture.state.getConnection(user.subject, 'expired-docs-connection'))?.status,
      'failed',
    );
    assert.equal(
      (await fixture.state.getAction(user.subject, prepared.actionId))?.failureCode,
      'connection_reconnect_required',
    );
    assert.equal(fixture.audit.events.at(-1)?.errorCode, 'connection_reconnect_required');
  });

  it('rejects a tool used with the wrong app and an expired approval', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'slack', 'connection-1');
    await assert.rejects(
      fixture.services.actions.prepare(user, {
        connectionId: 'connection-1',
        tool: 'mail.send',
        input: { to: ['a@example.com'], subject: '', body: 'hello' },
      }),
      hasCode('tool_connection_mismatch'),
    );

    await connect(fixture, 'gmail', 'connection-2');
    const prepared = await fixture.services.actions.prepare(user, {
      connectionId: 'connection-2',
      tool: 'mail.send',
      input: { to: ['a@example.com'], subject: '', body: 'hello' },
    });
    assert.equal(prepared.status, 'approval_required');
    fixture.clock.advance(601_000);
    await assert.rejects(
      fixture.services.actions.commit(user, {
        actionId: prepared.actionId,
        digest: prepared.digest,
        input: { to: ['a@example.com'], subject: '', body: 'hello' },
      }),
      hasCode('action_expired'),
    );
  });

  it('stages Drive bytes by opaque reference and materializes only the Composio descriptor', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'google_drive', 'drive-connection');

    const staged = await fixture.services.connectorFiles.requestUpload(user, {
      connectionId: 'drive-connection',
      fileName: 'quarterly-report.pdf',
      mimeType: 'application/pdf',
      byteLength: 1_024,
      md5: 'a'.repeat(32),
      sha256: 'A'.repeat(43),
    });

    assert.equal(staged.upload.method, 'PUT');
    assert.deepEqual(staged.upload.headers, {
      'content-type': 'application/pdf',
      'content-length': '1024',
    });
    assert.equal(JSON.stringify(staged).includes('provider-private'), false);
    assert.deepEqual(fixture.connector.uploadRequests, [
      {
        tool: 'drive.upload',
        fileName: 'quarterly-report.pdf',
        mimeType: 'application/pdf',
        md5: 'a'.repeat(32),
      },
    ]);

    const input = { file: staged.file, parent_id: 'folder-opaque' };
    const prepared = await fixture.services.actions.prepare(user, {
      connectionId: 'drive-connection',
      tool: 'drive.upload',
      input,
    });
    assert.equal(prepared.status, 'approval_required');
    const stored = [...fixture.state.actionRecords.values()][0];
    assert.ok(stored);
    assert.deepEqual(stored.inputKeys, ['file', 'parent_id']);
    assert.equal(JSON.stringify(stored).includes('quarterly-report.pdf'), false);
    assert.equal(JSON.stringify(stored).includes('provider-private'), false);

    await fixture.services.actions.commit(user, {
      actionId: prepared.actionId,
      digest: prepared.digest,
      input,
    });
    assert.deepEqual(fixture.connector.executions[0]?.input, {
      file_to_upload: {
        name: 'quarterly-report.pdf',
        mimetype: 'application/pdf',
        s3key: 'provider-private-1',
      },
      folder_to_upload_to: 'folder-opaque',
    });
    assert.equal(
      JSON.stringify(fixture.connector.executions[0]?.input).includes('uploadId'),
      false,
    );
    assert.equal(
      JSON.stringify(fixture.connector.executions[0]?.input).includes('file_path'),
      false,
    );
  });

  it('rejects oversized, unsupported, raw-path, and tampered Drive uploads', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'google_drive', 'drive-connection');
    await assert.rejects(
      fixture.services.connectorFiles.requestUpload(user, {
        connectionId: 'drive-connection',
        fileName: 'too-large.pdf',
        mimeType: 'application/pdf',
        byteLength: 5_000_001,
        md5: 'a'.repeat(32),
        sha256: 'A'.repeat(43),
      }),
      hasCode('connector_file_too_large'),
    );
    await assert.rejects(
      fixture.services.connectorFiles.requestUpload(user, {
        connectionId: 'drive-connection',
        fileName: 'payload.bin',
        mimeType: 'application/octet-stream',
        byteLength: 10,
        md5: 'a'.repeat(32),
        sha256: 'A'.repeat(43),
      }),
      hasCode('unsupported_connector_file_type'),
    );
    await assert.rejects(
      fixture.services.actions.prepare(user, {
        connectionId: 'drive-connection',
        tool: 'drive.upload',
        input: { file_path: '/Users/example/private.pdf' },
      }),
      hasCode('invalid_connector_input'),
    );

    const staged = await fixture.services.connectorFiles.requestUpload(user, {
      connectionId: 'drive-connection',
      fileName: 'safe.pdf',
      mimeType: 'application/pdf',
      byteLength: 10,
      md5: 'b'.repeat(32),
      sha256: 'B'.repeat(43),
    });
    await assert.rejects(
      fixture.services.actions.prepare(user, {
        connectionId: 'drive-connection',
        tool: 'drive.upload',
        input: { file: { ...staged.file, byteLength: 11 } },
      }),
      hasCode('connector_upload_mismatch'),
    );
  });
});

describe('connection lifecycle', () => {
  it('retires only the superseded Google credential after verifying its editor replacement', async () => {
    const fixture = makeFixture();
    const createdAt = fixture.clock.now().toISOString();
    await fixture.state.putConnection({
      id: 'grant-reader',
      userId: user.subject,
      app: 'google_workspace',
      status: 'connected',
      accountLabel: 'person@example.com',
      createdAt,
      updatedAt: createdAt,
    });
    await fixture.state.putConnection({
      id: 'grant-editor',
      userId: user.subject,
      app: 'google_workspace',
      status: 'connected',
      accountLabel: 'person@example.com',
      createdAt,
      updatedAt: createdAt,
    });
    fixture.connector.statuses.set('grant-reader', {
      status: 'connected',
      access: 'read_only',
      accountLabel: 'person@example.com',
    });
    fixture.connector.statuses.set('grant-editor', {
      status: 'connected',
      access: 'read_write',
      accountLabel: 'person@example.com',
    });

    assert.deepEqual(
      await fixture.services.connections.retireSupersededGoogle(
        user,
        'google_workspace',
        'grant-reader',
        'grant-editor',
      ),
      { retired: true },
    );
    assert.equal(await fixture.state.getConnection(user.subject, 'grant-reader'), undefined);
    assert.equal(
      (await fixture.state.getConnection(user.subject, 'grant-editor'))?.status,
      'connected',
    );
    assert.deepEqual([...fixture.connector.retiredConnectionIds], ['grant-reader']);
    assert.deepEqual(fixture.audit.events.at(-1), {
      userId: user.subject,
      action: 'connection.superseded',
      app: 'google_workspace',
      connectionId: 'grant-reader',
      outcome: 'allowed',
      occurredAt: createdAt,
    });
  });

  it('keeps the existing Google credential unless the replacement is an editor grant', async () => {
    const fixture = makeFixture();
    const createdAt = fixture.clock.now().toISOString();
    for (const id of ['grant-reader', 'replacement-reader']) {
      await fixture.state.putConnection({
        id,
        userId: user.subject,
        app: 'google_workspace',
        status: 'connected',
        accountLabel: 'person@example.com',
        createdAt,
        updatedAt: createdAt,
      });
      fixture.connector.statuses.set(id, {
        status: 'connected',
        access: 'read_only',
        accountLabel: 'person@example.com',
      });
    }

    await assert.rejects(
      fixture.services.connections.retireSupersededGoogle(
        user,
        'google_workspace',
        'grant-reader',
        'replacement-reader',
      ),
      hasCode('replacement_connection_not_ready'),
    );
    assert.ok(await fixture.state.getConnection(user.subject, 'grant-reader'));
    assert.equal(fixture.connector.retiredConnectionIds.size, 0);
  });

  it('isolates provider grants between Sia users', async () => {
    const fixture = makeFixture();
    const first = await fixture.services.connections.start(user, 'gmail');
    const second = await fixture.services.connections.start(otherUser, 'gmail');

    assert.notEqual(first.connectionId, second.connectionId);
    assert.deepEqual(
      (await fixture.services.connections.status(user, 'gmail')).connections.map(
        ({ id }) => id,
      ),
      [first.connectionId],
    );
    assert.deepEqual(
      (await fixture.services.connections.status(otherUser, 'gmail')).connections.map(
        ({ id }) => id,
      ),
      [second.connectionId],
    );

    assert.deepEqual(
      await fixture.services.connections.disconnect(otherUser, 'gmail', first.connectionId),
      { disconnected: true },
    );
    assert.equal(fixture.connector.statuses.get(first.connectionId)?.status, 'link_pending');
    assert.equal(fixture.state.connectionRecords.size, 2);
  });

  it('treats an already-removed connection as disconnected', async () => {
    const fixture = makeFixture();

    assert.deepEqual(
      await fixture.services.connections.disconnect(user, 'gmail', 'missing-connection'),
      { disconnected: true },
    );
    assert.equal(fixture.state.connectionRecords.size, 0);
    assert.equal(fixture.connector.statuses.has('missing-connection'), false);
  });

  it('cancels a pending link and removes its local connection record', async () => {
    const fixture = makeFixture();
    const started = await fixture.services.connections.start(user, 'gmail');

    assert.equal(fixture.state.connectionRecords.size, 1);
    assert.equal(fixture.connector.statuses.get(started.connectionId)?.status, 'link_pending');

    assert.deepEqual(
      await fixture.services.connections.disconnect(user, 'gmail', started.connectionId),
      { disconnected: true },
    );
    assert.equal(fixture.state.connectionRecords.size, 0);
    assert.equal(fixture.connector.statuses.get(started.connectionId)?.status, 'disconnected');
  });
});

describe('research boundary', () => {
  it('uploads only untainted research_allowed events under current consent', async () => {
    const fixture = makeFixture();
    const batch = validBatch();
    const result = await fixture.services.research.upload(user, batch);
    assert.equal(result.status, 'uploaded');
    assert.equal(result.eventCount, 1);
    assert.equal(fixture.objects.objects.size, 1);
    const metadata = fixture.state.batchRecords.values().next().value;
    assert.ok(metadata);
    assert.equal('events' in metadata, false);
    assert.equal('payload' in metadata, false);

    const duplicate = await fixture.services.research.upload(user, batch);
    assert.equal(duplicate.status, 'already_uploaded');
    assert.equal(fixture.objects.objects.size, 1);
  });

  it('rejects Google Workspace connector turns before they reach research storage', async () => {
    const fixture = makeFixture();
    const rawEvent = {
      batchId: 'google-raw-event',
      format: 'raw_v1' as const,
      scope: {
        threadId: 'thread-google',
        turnId: 'turn-google',
        eventKinds: ['sia.action_result'],
      },
      consent: {
        version: 'alpha-1',
        acceptedAt: '2026-08-13T00:00:00.000Z',
        purpose: 'research_evaluation_debugging' as const,
      },
      events: [
        {
          id: 'google-event-1',
          occurredAt: '2026-08-13T00:00:01.000Z',
          classification: 'research_allowed' as const,
          taints: [],
          kind: 'raw.event',
          payload: {
            schemaVersion: 1,
            threadId: 'thread-google',
            turnId: 'turn-google',
            eventType: 'sia.action_result',
            data: { name: 'docs_read', result: { text: 'must not be stored' } },
          },
        },
      ],
    } satisfies ResearchBatchRequest;
    const chunkBody = Buffer.from(
      JSON.stringify({ name: 'mail_search', result: { text: 'must not be stored' } }),
      'utf8',
    ).toString('base64');
    const rawChunk: ResearchBatchRequest = {
      ...rawEvent,
      batchId: 'google-raw-chunk',
      events: [
        {
          ...rawEvent.events[0]!,
          id: 'google-event-chunk-1',
          kind: 'raw.event_chunk',
          payload: {
            schemaVersion: 1,
            threadId: 'thread-google',
            turnId: 'turn-google',
            eventType: 'sia.action_result',
            eventId: 'google-event-original',
            encoding: 'base64-json',
            chunkIndex: 0,
            chunkCount: 1,
            chunkData: chunkBody,
          },
        },
      ],
    };

    for (const batch of [rawEvent, rawChunk]) {
      await assert.rejects(
        fixture.services.research.upload(user, batch),
        hasCode('google_workspace_research_forbidden'),
      );
    }
    assert.equal(fixture.objects.objects.size, 0);
    assert.equal(fixture.state.batchRecords.size, 0);
  });

  it('binds a reused batch ID to its canonical content', async () => {
    const fixture = makeFixture();
    const original = validBatch();
    await fixture.services.research.upload(user, original);

    const changed = structuredClone(original);
    changed.events[0]!.payload = { text: 'Different research content' };
    await assert.rejects(
      fixture.services.research.upload(user, changed),
      hasCode('research_batch_conflict'),
    );
    assert.equal(fixture.objects.objects.size, 1);
    assert.equal(fixture.state.batchRecords.size, 1);
  });

  it('creates one metadata record when matching uploads race', async () => {
    const fixture = makeFixture();
    const results = await Promise.all([
      fixture.services.research.upload(user, validBatch()),
      fixture.services.research.upload(user, structuredClone(validBatch())),
    ]);

    assert.deepEqual(results.map(({ status }) => status).sort(), [
      'already_uploaded',
      'uploaded',
    ]);
    assert.equal(fixture.objects.objects.size, 1);
    assert.equal(fixture.state.batchRecords.size, 1);
  });

  it('rejects different content racing for the same batch ID', async () => {
    const fixture = makeFixture();
    const changed = validBatch();
    changed.events[0]!.payload = { text: 'Competing research content' };
    const results = await Promise.allSettled([
      fixture.services.research.upload(user, validBatch()),
      fixture.services.research.upload(user, changed),
    ]);

    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    assert.ok(rejected);
    assert.ok(rejected.reason instanceof CloudError);
    assert.equal(rejected.reason.code, 'research_batch_conflict');
    assert.equal(fixture.state.batchRecords.size, 1);
    assert.equal(fixture.objects.objects.size, 1);
  });

  it('exports only claimed metadata while a conflicting object is awaiting its claim', async () => {
    const fixture = makeFixture();
    const originalPut = fixture.state.putBatchIfAbsent.bind(fixture.state);
    let releaseSecondClaim!: () => void;
    const secondClaim = new Promise<void>((resolve) => {
      releaseSecondClaim = resolve;
    });
    let claimCount = 0;
    fixture.state.putBatchIfAbsent = async (metadata) => {
      claimCount += 1;
      if (claimCount === 2) await secondClaim;
      return originalPut(metadata);
    };
    const changed = validBatch();
    changed.events[0]!.payload = { text: 'Unclaimed competing research content' };
    const winner = fixture.services.research.upload(user, validBatch());
    const loser = fixture.services.research.upload(user, changed);
    await winner;
    await new Promise<void>((resolve) => {
      const poll = (): void => {
        if (claimCount === 2) resolve();
        else setImmediate(poll);
      };
      poll();
    });

    const requested = await fixture.services.research.export(user);
    await fixture.services.researchExportWorker.process(user.subject, requested.exportId);
    const exported = await fixture.services.research.exportStatus(user, requested.exportId);
    assert.equal(exported.status, 'completed');
    const exportKey = exported.downloadUrl!.slice('memory://'.length);
    const body = Buffer.from(fixture.objects.objects.get(exportKey) ?? []).toString('utf8');
    assert.match(body, /Summarize my own local notes/);
    assert.doesNotMatch(body, /Unclaimed competing research content/);

    releaseSecondClaim();
    await assert.rejects(loser, hasCode('research_batch_conflict'));
  });

  it('fails a corrupted export safely and can retry the same job after recovery', async () => {
    const fixture = makeFixture();
    await fixture.services.research.upload(user, validBatch());
    const metadata = (await fixture.state.listBatches(user.subject))[0]!;
    const original = fixture.objects.objects.get(metadata.objectKey)!.slice();
    fixture.objects.objects.set(metadata.objectKey, Buffer.from('corrupted export input'));

    const requested = await fixture.services.research.export(user);
    await assert.rejects(
      fixture.services.researchExportWorker.process(user.subject, requested.exportId),
      /integrity check/,
    );
    assert.equal(
      (await fixture.services.research.exportStatus(user, requested.exportId)).status,
      'failed',
    );

    fixture.objects.objects.set(metadata.objectKey, original);
    await fixture.services.researchExportWorker.process(user.subject, requested.exportId);
    assert.equal(
      (await fixture.services.research.exportStatus(user, requested.exportId)).status,
      'completed',
    );
  });

  it('rejects connector taint, auth surfaces, and secret-shaped payloads before S3', async () => {
    for (const batch of [
      {
        ...validBatch(),
        batchId: 'tainted',
        events: [
          {
            ...validBatch().events[0]!,
            classification: 'operational_only' as const,
            taints: ['connector_data' as const],
          },
        ],
      },
      {
        ...validBatch(),
        batchId: 'auth',
        events: [
          {
            ...validBatch().events[0]!,
            classification: 'excluded' as const,
            taints: ['authentication_surface' as const],
          },
        ],
      },
      {
        ...validBatch(),
        batchId: 'secret',
        events: [
          {
            ...validBatch().events[0]!,
            payload: { authorization: 'Bearer this-is-a-private-token' },
          },
        ],
      },
    ] satisfies ResearchBatchRequest[]) {
      const fixture = makeFixture();
      await assert.rejects(fixture.services.research.upload(user, batch), (error: unknown) => {
        return (
          error instanceof CloudError &&
          ['research_data_not_allowed', 'sensitive_research_data'].includes(error.code)
        );
      });
      assert.equal(fixture.objects.objects.size, 0);
      assert.equal(fixture.state.batchRecords.size, 0);
    }
  });

  it('rejects stale consent', async () => {
    const fixture = makeFixture();
    const batch = validBatch();
    batch.consent.version = 'old-version';
    await assert.rejects(
      fixture.services.research.upload(user, batch),
      hasCode('consent_version_required'),
    );
  });

  it('stores v3 raw event bundles with turn metadata and exposes them only to admins', async () => {
    const fixture = makeFixture();
    await fixture.state.putInvite({
      email: 'user@example.com',
      invitedBy: admin.subject,
      invitedAt: fixture.clock.now().toISOString(),
      subject: user.subject,
      status: 'active',
    });
    const batch: ResearchBatchRequest = {
      batchId: 'raw-batch-1',
      format: 'raw_v1',
      scope: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequenceStart: 1,
        sequenceEnd: 1,
        eventKinds: ['provider.tool'],
      },
      consent: {
        version: 'alpha-1',
        acceptedAt: '2026-08-13T00:00:00.000Z',
        purpose: 'research_evaluation_debugging',
      },
      events: [
        {
          id: 'raw-event-1',
          occurredAt: '2026-08-13T00:00:01.000Z',
          classification: 'research_allowed',
          taints: [],
          kind: 'raw.event',
          payload: {
            schemaVersion: 1,
            threadId: 'thread-1',
            turnId: 'turn-1',
            eventType: 'provider.tool',
            data: {
              arguments: { command: 'printenv' },
              result: { authorization: 'raw research fixture' },
            },
          },
        },
      ],
    };

    await fixture.services.research.upload(user, batch);
    await assert.rejects(
      fixture.services.researchAdmin.participants(user),
      hasCode('admin_required'),
    );
    const participants = await fixture.services.researchAdmin.participants(admin);
    assert.deepEqual(participants.participants[0], {
      subject: user.subject,
      email: 'user@example.com',
      batchCount: 1,
      byteLength: participants.participants[0]?.byteLength,
      lastCreatedAt: '2026-08-13T00:00:00.000Z',
    });
    const batches = await fixture.services.researchAdmin.batches(admin, user.subject);
    assert.equal(batches.batches[0]?.format, 'raw_v1');
    assert.equal(batches.batches[0]?.scope?.turnId, 'turn-1');
    const read = await fixture.services.researchAdmin.batch(admin, user.subject, 'raw-batch-1');
    assert.match(JSON.stringify(read.batch), /raw research fixture/);
    assert.equal(
      fixture.audit.events.filter(({ action }) => action.startsWith('research.admin')).length,
      4,
    );
    assert.equal(
      fixture.audit.events.find(
        ({ action, userId }) =>
          action === 'research.admin.participants' && userId === user.subject,
      )?.outcome,
      'denied',
    );
  });

  it('denies and audits an admin archive read until MFA is configured', async () => {
    const fixture = makeFixture();
    fixture.identity.hasMfa = async () => false;

    await assert.rejects(
      fixture.services.researchAdmin.participants(admin),
      hasCode('admin_mfa_required'),
    );
    assert.deepEqual(fixture.audit.events.at(-1), {
      userId: admin.subject,
      action: 'research.admin.participants',
      outcome: 'denied',
      occurredAt: '2026-08-13T00:00:00.000Z',
      errorCode: 'admin_mfa_required',
    });
  });

  it('rejects raw bundles whose event organization does not match the declared turn', async () => {
    const fixture = makeFixture();
    const batch: ResearchBatchRequest = {
      batchId: 'raw-batch-mismatch',
      format: 'raw_v1',
      scope: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        eventKinds: ['provider.message'],
      },
      consent: {
        version: 'alpha-1',
        acceptedAt: '2026-08-13T00:00:00.000Z',
        purpose: 'research_evaluation_debugging',
      },
      events: [
        {
          id: 'raw-event-mismatch',
          occurredAt: '2026-08-13T00:00:01.000Z',
          classification: 'research_allowed',
          taints: [],
          kind: 'raw.event',
          payload: {
            schemaVersion: 1,
            threadId: 'thread-1',
            turnId: 'different-turn',
            eventType: 'provider.message',
            data: { text: 'raw' },
          },
        },
      ],
    };

    await assert.rejects(
      fixture.services.research.upload(user, batch),
      hasCode('invalid_raw_research_batch'),
    );
    assert.equal(fixture.objects.objects.size, 0);
  });
});

describe('invites and deletion', () => {
  it('activates only named invites and rate-limits without exposing existence', async () => {
    const fixture = makeFixture();
    const request = {
      email: 'Person@Example.com',
      researchEnrollmentAcknowledged: true as const,
    };
    await fixture.state.putInvite({
      email: 'person@example.com',
      invitedBy: admin.subject,
      invitedAt: fixture.clock.now().toISOString(),
      subject: 'subject-person@example.com',
      status: 'invited',
    });
    assert.deepEqual(await fixture.services.registration.create(request, '203.0.113.10'), {
      accepted: true,
    });
    assert.deepEqual(await fixture.services.registration.create(request, '203.0.113.10'), {
      accepted: true,
    });
    assert.equal(fixture.identity.creations[0]?.email, 'person@example.com');
    assert.equal(fixture.identity.creations[0]?.suppressMessage, true);
    assert.equal((await fixture.state.getInvite('person@example.com'))?.status, 'active');
    assert.deepEqual(fixture.identity.groupAdditions.slice(0, 2), [
      { email: 'person@example.com', group: 'Users' },
      { email: 'person@example.com', group: 'Participants' },
    ]);
    await fixture.services.registration.create(request, '203.0.113.10');
    await fixture.services.registration.create(request, '203.0.113.10');
    await assert.rejects(
      fixture.services.registration.create(request, '203.0.113.10'),
      hasCode('registration_rate_limited'),
    );
  });

  it('creates a base account without requiring a research invitation', async () => {
    const fixture = makeFixture();
    assert.deepEqual(
      await fixture.services.registration.create(
        { email: 'unknown@example.net', researchEnrollmentAcknowledged: true },
        '198.51.100.12',
      ),
      { accepted: true },
    );
    assert.equal(fixture.identity.creations.length, 1);
    assert.deepEqual(fixture.identity.groupAdditions, [
      { email: 'unknown@example.net', group: 'Users' },
    ]);
    assert.equal(await fixture.state.getInvite('unknown@example.net'), undefined);
  });

  it('accepts legacy registration payloads without coupling account access to research', async () => {
    const fixture = makeFixture();
    assert.deepEqual(
      await fixture.services.registration.create(
        { email: 'person@example.com', researchEnrollmentAcknowledged: false },
        '203.0.113.10',
      ),
      { accepted: true },
    );
    assert.deepEqual(fixture.identity.groupAdditions, [
      { email: 'person@example.com', group: 'Users' },
    ]);
  });

  it('requires Admins membership and enforces the invitation cap', async () => {
    const fixture = makeFixture({ inviteLimit: 1 });
    await assert.rejects(
      fixture.services.invites.create(user, { email: 'person@example.com' }),
      hasCode('admin_required'),
    );
    const created = await fixture.services.invites.create(admin, {
      email: 'Person@Example.com',
    });
    assert.equal(created.email, 'person@example.com');
    assert.deepEqual(fixture.identity.groupAdditions.slice(0, 2), [
      { email: 'person@example.com', group: 'Users' },
      { email: 'person@example.com', group: 'Participants' },
    ]);
    const idempotent = await fixture.services.invites.create(admin, {
      email: 'person@example.com',
    });
    assert.equal(idempotent.subject, created.subject);
    await assert.rejects(
      fixture.services.invites.create(admin, { email: 'second@example.com' }),
      hasCode('invite_limit_reached'),
    );
  });

  it('runs research deletion idempotently and leaves app connections intact', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'gmail', 'connection-1');
    await fixture.services.research.upload(user, validBatch());
    const requested = await fixture.services.research.requestDeletion(user, 'research');
    assert.equal(requested.state, 'requested');
    assert.equal(fixture.queue.messages.length, 1);

    await fixture.services.deletionWorker.process(user.subject, requested.id, 'research');
    assert.equal(
      (await fixture.state.getDeletion(user.subject, requested.id))?.state,
      'completed',
    );
    assert.equal(fixture.objects.objects.size, 0);
    assert.equal(fixture.state.batchRecords.size, 0);
    assert.equal(fixture.state.connectionRecords.size, 1);
    await fixture.services.deletionWorker.process(user.subject, requested.id, 'research');
  });

  it('account deletion revokes connections and deletes identity', async () => {
    const fixture = makeFixture();
    await connect(fixture, 'slack', 'connection-1');
    fixture.identity.users.set(user.subject, user.email ?? 'unknown');
    await fixture.state.putInvite({
      email: user.email!,
      invitedBy: admin.subject,
      invitedAt: fixture.clock.now().toISOString(),
      subject: user.subject,
      status: 'active',
    });
    await fixture.quota.consumeVoiceToken(user.subject, {
      period: '2026-08-13',
      expiresAt: 123456,
      tokenMintLimit: 20,
    });
    const requested = await fixture.services.research.requestDeletion(user, 'account');
    await fixture.services.deletionWorker.process(user.subject, requested.id, 'account');
    assert.equal(fixture.connector.statuses.get('connection-1')?.status, 'disconnected');
    assert.equal(fixture.state.connectionRecords.size, 0);
    assert.equal(fixture.identity.users.has(user.subject), false);
    assert.equal(await fixture.state.getInvite(user.email!), undefined);
    assert.equal(await fixture.quota.getVoiceTokenUsage(user.subject, '2026-08-13'), 0);
    assert.equal(
      (await fixture.state.getDeletion(user.subject, requested.id))?.state,
      'completed',
    );
  });
});

describe('Meta relay service', () => {
  it('returns authenticated release capabilities without consuming turn quota', async () => {
    const fixture = makeFixture();

    assert.deepEqual(await fixture.services.meta.capabilities(user), {
      available: true,
      models: ['meta-test'],
      streaming: true,
      tools: true,
    });
  });

  it('pins configured models and releases its concurrency lease', async () => {
    const fixture = makeFixture();
    const events = [];
    for await (const event of fixture.services.meta.stream(user, {
      turnId: 'turn-1',
      sessionId: 'client-selected-session',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event);
    }
    assert.deepEqual(
      events.map((event) => event.type),
      ['started', 'delta', 'usage', 'done'],
    );
    assert.equal(events[0]?.type === 'started' ? events[0].model : undefined, 'meta-test');
    assert.match(
      events[0]?.type === 'started' ? events[0].sessionId : '',
      /^[A-Za-z0-9_-]{43}$/,
    );
    assert.notEqual(
      events[0]?.type === 'started' ? events[0].sessionId : undefined,
      'client-selected-session',
    );
    const usage = await fixture.services.hostedModels.usage(user);
    assert.deepEqual(usage.providers[0]?.usage, {
      requests: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it('publishes a sanitized included-model catalog to base users', async () => {
    const fixture = makeFixture();
    const catalog = await fixture.services.hostedModels.catalog(baseUser);

    assert.deepEqual(catalog, {
      schemaVersion: 1,
      providers: [
        {
          id: 'meta',
          name: 'Included model',
          kind: 'hosted',
          credentialMode: 'managed',
          available: true,
          defaultModel: 'meta-test',
          models: [
            {
              id: 'meta-test',
              name: 'meta-test',
              apiProtocols: ['openai_responses'],
            },
          ],
          capabilities: { streaming: true, tools: true },
          execution: {
            defaultHarnessId: 'codex_app_server',
            routes: [
              {
                model: 'meta-test',
                harnessId: 'codex_app_server',
                harnessModelId: 'meta-test',
                credentialSource: 'sia_managed',
                apiProtocol: 'openai_responses',
              },
            ],
          },
          limits: {
            dailyRequests: 100,
            dailyTokens: 250_000,
            maxOutputTokens: 4_096,
          },
        },
      ],
    });
    assert.doesNotMatch(JSON.stringify(catalog), /apiKey|endpoint|test-meta-key/);
    assert.equal((await fixture.services.meta.capabilities(baseUser)).available, true);
  });

  it('onboards additional model labs from secret configuration without exposing keys', async () => {
    const fixture = makeFixture({
      metaConfig: {
        apiKey: 'first-lab-key-with-enough-characters',
        endpoint: 'https://first-lab.invalid/v1',
        model: 'first/spark',
        enabled: true,
        catalogId: 'first-lab',
        displayName: 'First Lab',
        allowedModels: ['first/spark'],
        additionalLabs: [
          {
            apiKey: 'second-lab-key-with-enough-characters',
            endpoint: 'https://second-lab.invalid/v1',
            model: 'second/fast',
            enabled: true,
            catalogId: 'second-lab',
            displayName: 'Second Lab',
            allowedModels: ['second/fast'],
            defaultHarnessId: 'second_lab_harness',
            harnessRoutes: [
              {
                model: 'second/fast',
                harnessId: 'second_lab_harness',
                harnessModelId: 'fast-v2',
                credentialSource: 'provider_api',
                apiProtocol: 'openai_responses',
              },
            ],
          },
        ],
      },
    });

    const catalog = await fixture.services.hostedModels.catalog(baseUser);
    assert.deepEqual(
      catalog.providers.map(({ id, name, models }) => ({ id, name, models })),
      [
        {
          id: 'first-lab',
          name: 'First Lab',
          models: [
            {
              id: 'first/spark',
              name: 'first/spark',
              apiProtocols: ['openai_responses'],
            },
          ],
        },
        {
          id: 'second-lab',
          name: 'Second Lab',
          models: [
            {
              id: 'second/fast',
              name: 'second/fast',
              apiProtocols: ['openai_responses'],
            },
          ],
        },
      ],
    );
    assert.deepEqual(catalog.providers[1]?.execution, {
      defaultHarnessId: 'second_lab_harness',
      routes: [
        {
          model: 'second/fast',
          harnessId: 'codex_app_server',
          harnessModelId: 'second/fast',
          credentialSource: 'sia_managed',
          apiProtocol: 'openai_responses',
        },
        {
          model: 'second/fast',
          harnessId: 'second_lab_harness',
          harnessModelId: 'fast-v2',
          credentialSource: 'provider_api',
          apiProtocol: 'openai_responses',
        },
      ],
    });
    assert.doesNotMatch(JSON.stringify(catalog), /first-lab-key|second-lab-key|endpoint/);
    const events = [];
    for await (const event of fixture.services.hostedModels.stream(baseUser, {
      turnId: 'second-lab-turn',
      model: 'second/fast',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event);
    }
    assert.equal(events[0]?.type, 'started');
    assert.equal(events[0]?.turnId, 'second-lab-turn');
    assert.equal(events[0]?.model, 'second/fast');
    assert.match(
      events[0]?.type === 'started' ? events[0].sessionId : '',
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it('allows a model tester without granting participant or connector access', async () => {
    const fixture = makeFixture();

    assert.deepEqual(await fixture.services.meta.capabilities(metaTester), {
      available: true,
      models: ['meta-test'],
      streaming: true,
      tools: true,
    });
    await assert.rejects(
      fixture.services.research.upload(metaTester, validBatch()),
      hasCode('participant_access_required'),
    );
    await assert.rejects(
      fixture.services.connections.start(metaTester, 'slack'),
      hasCode('participant_access_required'),
    );
  });
});

describe('hosted voice service', () => {
  it('returns a sanitized voice catalog and native single-use token', async () => {
    const fixture = makeFixture();
    const catalog = await fixture.services.voice.catalog(baseUser);
    assert.deepEqual(catalog.provider.voices, [
      { id: 'voice-1', name: 'Aria', category: 'premade' },
    ]);
    assert.equal(catalog.provider.credentialMode, 'managed');
    assert.doesNotMatch(JSON.stringify(catalog), /apiKey|test-elevenlabs-key/);

    const token = await fixture.services.voice.mintToken(baseUser, {
      type: 'realtime_scribe',
    });
    assert.deepEqual(token, {
      token: 'sutkn_realtime_scribe_1',
      type: 'realtime_scribe',
      expiresAt: '2026-08-13T00:15:00.000Z',
      singleUse: true,
    });
    assert.deepEqual(fixture.voiceProvider.tokenRequests, ['realtime_scribe']);
    assert.deepEqual(fixture.audit.events.at(-1), {
      userId: baseUser.subject,
      action: 'voice.token_mint',
      outcome: 'allowed',
      occurredAt: '2026-08-13T00:00:00.000Z',
    });
  });

  it('enforces the server-side daily token mint limit', async () => {
    const fixture = makeFixture({ voiceDailyTokenMintLimit: 1 });
    await fixture.services.voice.mintToken(baseUser, { type: 'tts_websocket' });
    await assert.rejects(
      fixture.services.voice.mintToken(baseUser, { type: 'tts_websocket' }),
      hasCode('voice_token_daily_limit'),
    );
  });
});

function makeFixture(
  overrides: {
    inviteLimit?: number;
    voiceDailyTokenMintLimit?: number;
    metaConfig?: MetaConfig;
  } = {},
) {
  const state = new MemoryState();
  const connector = new MemoryConnector();
  const objects = new MemoryResearchObjects();
  const identity = new MemoryIdentity();
  const queue = new MemoryDeletionQueue();
  const exportQueue = new MemoryResearchExportQueue();
  const releaseManifests = new MemoryReleaseManifests({
    payload: {
      schemaVersion: 1,
      channel: 'internal',
      platform: 'macos',
      architecture: 'universal',
      version: '0.1.0-alpha.13',
      publishedAt: '2026-08-26T12:00:00.000Z',
      minimumSystemVersion: '14.0',
      artifact: {
        key: 'releases/0.1.0-alpha.13/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.13-universal.dmg',
        sha256: 'a'.repeat(64),
        bytes: 250_000_000,
      },
    },
    keyId: 'sia-release-2026-01',
    signature: 'A'.repeat(86),
  });
  const audit = new MemoryAudit();
  const voiceProvider = new MemoryVoiceProvider();
  const quota = new MemoryQuota();
  const clock = new FixedClock(new Date('2026-08-13T00:00:00.000Z'));
  const metaConfig: MetaConfig = overrides.metaConfig ?? {
    apiKey: 'test-meta-key-with-enough-characters',
    endpoint: 'https://meta.invalid/v1',
    model: 'meta-test',
    enabled: true,
    allowedModels: ['meta-test'],
  };
  const composioConfig: ComposioConfig = {
    apiKey: 'test-composio-key-with-enough-characters',
    baseUrl: 'https://composio.invalid',
    authConfigIds: {
      gmail: 'gmail',
      google_drive: 'drive',
      google_docs: 'docs',
      google_sheets: 'sheets',
      google_slides: 'slides',
      slack: 'slack',
    },
    toolSlugs: { ...COMPOSIO_TOOL_SLUGS } as Record<ToolName, string>,
    toolVersions: { ...COMPOSIO_TOOL_VERSIONS } as Record<ToolName, string>,
  };
  const deps: ServiceDependencies = {
    clock,
    ids: new SequenceIds(),
    connections: state,
    connector,
    connectorUploads: state,
    actions: state,
    research: state,
    researchExports: state,
    researchExportQueue: exportQueue,
    researchObjects: objects,
    releaseManifests,
    invites: state,
    registrationLimits: state,
    identity,
    deletions: state,
    deletionQueue: queue,
    secrets: new FixedSecrets(metaConfig, composioConfig),
    metaProvider: new EchoMetaProvider(),
    voiceProvider,
    quota,
    audit,
    config: {
      actionTtlSeconds: 600,
      consentVersion: 'alpha-1',
      inviteLimit: overrides.inviteLimit ?? 20,
      metaDailyRequestLimit: 100,
      metaDailyTokenLimit: 250_000,
      voiceDailyTokenMintLimit: overrides.voiceDailyTokenMintLimit ?? 20,
      features: {
        researchUploads: true,
        researchArchive: true,
        connectors: true,
        schedules: true,
        hostedModels: true,
        hostedVoice: true,
      },
    },
  };
  return {
    state,
    connector,
    objects,
    identity,
    queue,
    exportQueue,
    audit,
    voiceProvider,
    quota,
    clock,
    services: createServices(deps),
  };
}

async function connect(fixture: ReturnType<typeof makeFixture>, app: AppId, id: string) {
  await fixture.state.putConnection({
    id,
    userId: user.subject,
    app,
    status: 'connected',
    createdAt: fixture.clock.now().toISOString(),
    updatedAt: fixture.clock.now().toISOString(),
  });
  fixture.connector.statuses.set(id, { status: 'connected' });
}

function validBatch(): ResearchBatchRequest {
  return {
    batchId: 'batch-1',
    consent: {
      version: 'alpha-1',
      acceptedAt: '2026-08-13T00:00:00.000Z',
      purpose: 'research_evaluation_debugging',
    },
    events: [
      {
        id: 'event-1',
        occurredAt: '2026-08-13T00:00:01.000Z',
        classification: 'research_allowed',
        taints: [],
        kind: 'user_prompt',
        payload: { text: 'Summarize my own local notes' },
      },
    ],
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof CloudError && error.code === code;
}
