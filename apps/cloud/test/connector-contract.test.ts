import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolName } from '../src/contracts.js';
import {
  assertComposioContract,
  COMPOSIO_TOOL_SLUGS,
  COMPOSIO_TOOL_VERSION,
  mapCanonicalConnectorInput,
  validateCanonicalDriveUploadInput,
} from '../src/connector-contract.js';
import { CloudError } from '../src/domain.js';
import type { ComposioConfig } from '../src/ports.js';

describe('canonical connector input mapping', () => {
  const cases = [
    [
      'mail.search',
      { query: 'from:person@example.com', limit: 20 },
      {
        query: 'from:person@example.com',
        max_results: 20,
        include_payload: false,
        verbose: false,
      },
    ],
    [
      'mail.read_thread',
      { resource_id: '19bf77729bcb3a44' },
      { thread_id: '19bf77729bcb3a44' },
    ],
    [
      'mail.create_draft',
      {
        to: ['first@example.com', 'second@example.com'],
        cc: ['copy@example.com'],
        subject: 'Subject',
        body: 'Plain text',
        thread_id: 'thread-1',
      },
      {
        recipient_email: 'first@example.com',
        extra_recipients: ['second@example.com'],
        cc: ['copy@example.com'],
        subject: 'Subject',
        body: 'Plain text',
        is_html: false,
        thread_id: 'thread-1',
      },
    ],
    [
      'mail.send',
      { to: ['first@example.com'], subject: 'Subject', body: 'Plain text' },
      {
        recipient_email: 'first@example.com',
        subject: 'Subject',
        body: 'Plain text',
        is_html: false,
      },
    ],
    [
      'drive.search',
      { query: "name contains 'report'", limit: 25 },
      { q: "name contains 'report'", pageSize: 25 },
    ],
    ['drive.read', { resource_id: 'drive-file-1' }, { fileId: 'drive-file-1' }],
    [
      'drive.share',
      { resource_id: 'drive-file-1', recipient: 'person@example.com', role: 'commenter' },
      {
        file_id: 'drive-file-1',
        email_address: 'person@example.com',
        role: 'commenter',
        type: 'user',
        send_notification_email: true,
      },
    ],
    [
      'slack.search',
      { query: 'in:general launch', limit: 30 },
      { query: 'in:general launch', count: 30, auto_paginate: false },
    ],
    [
      'slack.read_thread',
      { resource_id: 'C012ABCDEF:1723500000.000100' },
      { channel: 'C012ABCDEF', ts: '1723500000.000100', limit: 100 },
    ],
    [
      'slack.post',
      { channel_id: 'C012ABCDEF', text: 'Status **ready**', thread_id: '1723500000.000100' },
      {
        channel: 'C012ABCDEF',
        markdown_text: 'Status **ready**',
        thread_ts: '1723500000.000100',
      },
    ],
  ] as const;

  for (const [tool, input, expected] of cases) {
    it(`maps ${tool} to its pinned provider schema`, () => {
      assert.deepEqual(mapCanonicalConnectorInput(tool, { ...input }), expected);
    });

    it(`rejects unknown ${tool} fields`, () => {
      assert.throws(
        () => mapCanonicalConnectorInput(tool, { ...input, unexpected: 'not allowed' }),
        hasCode('invalid_connector_input'),
      );
    });
  }

  it('enforces canonical limits and unsupported thread semantics', () => {
    assert.throws(
      () => mapCanonicalConnectorInput('mail.search', { query: 'x', limit: 101 }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('mail.send', {
          to: ['not-an-email'],
          subject: '',
          body: '',
        }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('mail.send', {
          to: ['person@example.com'],
          subject: 'Reply',
          body: 'Body',
          thread_id: 'thread-1',
        }),
      hasCode('connector_feature_not_supported'),
    );
    assert.throws(
      () => mapCanonicalConnectorInput('slack.read_thread', { resource_id: 'timestamp-only' }),
      hasCode('invalid_connector_input'),
    );
  });

  it('validates Drive upload descriptors and rejects raw paths', () => {
    assert.doesNotThrow(() =>
      validateCanonicalDriveUploadInput({
        file: {
          uploadId: 'upload-1',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          byteLength: 1_000,
          sha256: 'A'.repeat(43),
        },
        parent_id: 'folder-1',
      }),
    );
    assert.throws(
      () => validateCanonicalDriveUploadInput({ file_path: '/private/report.pdf' }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        validateCanonicalDriveUploadInput({
          file: {
            uploadId: 'upload-1',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            byteLength: 5_000_001,
            sha256: 'A'.repeat(43),
          },
        }),
      hasCode('invalid_connector_input'),
    );
  });
});

describe('pinned Composio deployment contract', () => {
  it('accepts only the audited version and exact slugs', () => {
    const config = validConfig();
    assert.doesNotThrow(() => assertComposioContract(config));
    assert.throws(
      () => assertComposioContract({ ...config, toolVersion: 'latest' }),
      hasCode('connector_contract_mismatch'),
    );
    assert.throws(
      () =>
        assertComposioContract({
          ...config,
          toolSlugs: { ...config.toolSlugs, 'slack.post': 'SLACK_CHAT_POST_MESSAGE' },
        }),
      hasCode('connector_contract_mismatch'),
    );
  });
});

function validConfig(): ComposioConfig {
  return {
    apiKey: 'provider-secret-with-enough-characters',
    baseUrl: 'https://backend.composio.test',
    authConfigIds: { gmail: 'gmail', google_drive: 'drive', slack: 'slack' },
    toolSlugs: { ...COMPOSIO_TOOL_SLUGS } as Record<ToolName, string>,
    toolVersion: COMPOSIO_TOOL_VERSION,
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof CloudError && error.code === code;
}
