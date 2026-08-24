import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolName } from '../src/contracts.js';
import {
  assertComposioContract,
  COMPOSIO_TOOL_SLUGS,
  COMPOSIO_TOOL_VERSIONS,
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
      'docs.create',
      { title: 'Launch notes', markdown: '# Launch\n\nReady.' },
      { title: 'Launch notes', markdown_text: '# Launch\n\nReady.' },
    ],
    [
      'docs.read',
      { document_id: 'document-1' },
      { document_id: 'document-1', include_tables: true, include_tabs_content: true },
    ],
    [
      'docs.append',
      { document_id: 'document-1', text: '\nNext step.' },
      { document_id: 'document-1', text_to_insert: '\nNext step.', append_to_end: true },
    ],
    [
      'sheets.create',
      { title: 'Launch tracker', folder_id: 'folder-1' },
      { title: 'Launch tracker', folder_id: 'folder-1' },
    ],
    [
      'sheets.read',
      { spreadsheet_id: 'sheet-1', range: 'Launch!A1:C20', start_row: 1, end_row: 20 },
      {
        spreadsheet_id: 'sheet-1',
        range: 'Launch!A1:C20',
        start_row: 1,
        end_row: 20,
        major_dimension: 'ROWS',
        value_render_option: 'FORMATTED_VALUE',
        date_time_render_option: 'FORMATTED_STRING',
      },
    ],
    [
      'sheets.read',
      {
        spreadsheet_id: 'https://docs.google.com/spreadsheets/d/sheet-from-url/edit#gid=0',
        range: 'A1:A1',
        start_row: 1,
        end_row: 1,
      },
      {
        spreadsheet_id: 'sheet-from-url',
        range: 'A1:A1',
        start_row: 1,
        end_row: 1,
        major_dimension: 'ROWS',
        value_render_option: 'FORMATTED_VALUE',
        date_time_render_option: 'FORMATTED_STRING',
      },
    ],
    [
      'sheets.update',
      {
        spreadsheet_id: 'sheet-1',
        range: 'Launch!A1:B2',
        values: [
          ['Owner', 'Ready'],
          ['Sia', true],
        ],
        value_input_option: 'USER_ENTERED',
      },
      {
        spreadsheet_id: 'sheet-1',
        range: 'Launch!A1:B2',
        values: [
          ['Owner', 'Ready'],
          ['Sia', true],
        ],
        major_dimension: 'ROWS',
        auto_expand_sheet: true,
        value_input_option: 'USER_ENTERED',
        include_values_in_response: false,
      },
    ],
    [
      'sheets.append',
      {
        spreadsheet_id: 'sheet-1',
        range: 'Launch!A:B',
        values: [['Sia', null]],
        value_input_option: 'RAW',
      },
      {
        spreadsheetId: 'sheet-1',
        range: 'Launch!A:B',
        values: [['Sia', null]],
        majorDimension: 'ROWS',
        insertDataOption: 'INSERT_ROWS',
        valueInputOption: 'RAW',
        includeValuesInResponse: false,
      },
    ],
    [
      'slides.create',
      { title: 'Launch review', markdown: '# Launch\n\n---\n\n# Results' },
      { title: 'Launch review', markdown_text: '# Launch\n\n---\n\n# Results' },
    ],
    [
      'slides.read',
      { presentation_id: 'deck-1' },
      {
        presentationId: 'deck-1',
        fields:
          'presentationId,title,slides(objectId,pageElements(objectId,title,description,shape(shapeType,text)))',
      },
    ],
    [
      'slides.append',
      { presentation_id: 'deck-1', markdown: '# Next steps' },
      { presentationId: 'deck-1', markdown_text: '# Next steps' },
    ],
    [
      'slack.search',
      { query: 'in:general launch', limit: 30 },
      { query: 'in:general launch', count: 30, auto_paginate: false },
    ],
    [
      'slack.find_users',
      { query: 'Lawrence Jang', limit: 10 },
      {
        search_query: 'Lawrence Jang',
        limit: 10,
        exact_match: false,
        include_bots: false,
        include_deleted: false,
        include_restricted: true,
      },
    ],
    [
      'slack.open_dm',
      { user_id: 'U012ABCDEF' },
      { users: 'U012ABCDEF', return_im: true, prevent_creation: false },
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
    assert.throws(
      () => mapCanonicalConnectorInput('slack.open_dm', { user_id: 'Lawrence Jang' }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('sheets.read', {
          spreadsheet_id: 'sheet-1',
          range: 'Sheet1!A:Z',
          start_row: 1,
          end_row: 501,
        }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('sheets.append', {
          spreadsheet_id: 'sheet-1',
          range: 'A:B',
          values: [['missing sheet name']],
          value_input_option: 'RAW',
        }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('sheets.read', {
          spreadsheet_id: 'https://example.com/spreadsheets/d/not-google/edit',
          range: 'Sheet1!A1',
          start_row: 1,
          end_row: 1,
        }),
      hasCode('invalid_connector_input'),
    );
    assert.throws(
      () =>
        mapCanonicalConnectorInput('docs.read', {
          document_id: 'https://docs.google.com/document/d/%E0%A4%A/edit',
        }),
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
      () =>
        assertComposioContract({
          ...config,
          toolVersions: { ...config.toolVersions, 'docs.read': 'latest' },
        }),
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
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof CloudError && error.code === code;
}
