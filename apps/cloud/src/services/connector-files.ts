import {
  TOOL_POLICIES,
  type AuthContext,
  type ConnectorUploadDescriptor,
  type ConnectorUploadRequest,
} from '../contracts.js';
import { CloudError, canonicalJson, requireString } from '../domain.js';
import {
  mapCanonicalConnectorInput,
  validateCanonicalDriveUploadInput,
} from '../connector-contract.js';
import type { ConnectorUploadRecord } from '../ports.js';
import type { ServiceDependencies } from '../services.js';
import { requireConnectorAccess } from './access.js';

const MAX_CONNECTOR_UPLOAD_BYTES = 5_000_000;

const CONNECTOR_UPLOAD_TTL_SECONDS = 15 * 60;

const CONNECTOR_UPLOAD_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'application/zip',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
]);

export class ConnectorFilesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async requestUpload(user: AuthContext, request: ConnectorUploadRequest) {
    requireConnectorAccess(this.deps, user);
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (
      !connection ||
      connection.status !== 'connected' ||
      (connection.app !== 'google_drive' && connection.app !== 'google_workspace')
    ) {
      throw new CloudError(
        404,
        'connection_not_ready',
        'The selected Drive connection is not ready',
      );
    }
    const fileName = validateConnectorFileName(request.fileName);
    const mimeType = validateConnectorMimeType(request.mimeType);
    const byteLength = validateConnectorByteLength(request.byteLength);
    const md5 = validateHash(request.md5, 'md5', /^[a-f0-9]{32}$/);
    const sha256 = validateHash(request.sha256, 'sha256', /^[A-Za-z0-9_-]{43}$/);
    const grant = await this.deps.connector.requestFileUpload(
      request.connectionId,
      'drive.upload',
      fileName,
      mimeType,
      md5,
    );
    const now = this.deps.clock.now();
    const uploadId = this.deps.ids.next();
    const expiresAt = Math.floor(now.getTime() / 1000) + CONNECTOR_UPLOAD_TTL_SECONDS;
    const record: ConnectorUploadRecord = {
      uploadId,
      userId: user.subject,
      connectionId: request.connectionId,
      providerKey: grant.providerKey,
      fileName,
      mimeType,
      byteLength,
      md5,
      sha256,
      createdAt: now.toISOString(),
      expiresAt,
    };
    await this.deps.connectorUploads.putConnectorUpload(record);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connector.file_stage',
      app: 'google_drive',
      tool: 'drive.upload',
      connectionId: request.connectionId,
      outcome: 'allowed',
      occurredAt: now.toISOString(),
    });
    return {
      file: publicUploadDescriptor(record),
      upload: {
        method: 'PUT' as const,
        url: grant.uploadUrl,
        headers: {
          'content-type': mimeType,
          'content-length': String(byteLength),
        },
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      },
    };
  }
}

function publicUploadDescriptor(record: ConnectorUploadRecord): ConnectorUploadDescriptor {
  return {
    uploadId: record.uploadId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    sha256: record.sha256,
  };
}

export async function resolveConnectorInput(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
  tool: keyof typeof TOOL_POLICIES,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (tool === 'drive.upload') {
    validateCanonicalDriveUploadInput(input);
    return resolveDriveUpload(deps, userId, connectionId, input);
  }
  return mapCanonicalConnectorInput(tool, input);
}

async function resolveDriveUpload(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allowedInputKeys = new Set(['file', 'parent_id']);
  if (Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
    throw new CloudError(
      400,
      'invalid_drive_upload',
      'Drive upload contains unsupported fields',
    );
  }
  const file = input.file;
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new CloudError(
      400,
      'invalid_drive_upload',
      'Drive upload requires a staged file reference',
    );
  }
  const descriptor = file as Record<string, unknown>;
  const allowedDescriptorKeys = new Set([
    'uploadId',
    'fileName',
    'mimeType',
    'byteLength',
    'sha256',
  ]);
  if (Object.keys(descriptor).some((key) => !allowedDescriptorKeys.has(key))) {
    throw new CloudError(400, 'invalid_drive_upload', 'The staged file reference is invalid');
  }
  const uploadId = requireString(descriptor.uploadId, 'file.uploadId', { max: 128 });
  const upload = await deps.connectorUploads.getConnectorUpload(userId, uploadId);
  if (!upload || upload.connectionId !== connectionId) {
    throw new CloudError(404, 'connector_upload_not_found', 'The staged file is unavailable');
  }
  if (upload.expiresAt <= Math.floor(deps.clock.now().getTime() / 1000)) {
    throw new CloudError(
      410,
      'connector_upload_expired',
      'The staged file expired; upload it again',
    );
  }
  const supplied: ConnectorUploadDescriptor = {
    uploadId,
    fileName: requireString(descriptor.fileName, 'file.fileName', { max: 255 }),
    mimeType: requireString(descriptor.mimeType, 'file.mimeType', { max: 127 }),
    byteLength: validateConnectorByteLength(descriptor.byteLength),
    sha256: requireString(descriptor.sha256, 'file.sha256', { max: 64 }),
  };
  if (canonicalJson(supplied) !== canonicalJson(publicUploadDescriptor(upload))) {
    throw new CloudError(409, 'connector_upload_mismatch', 'The staged file metadata changed');
  }
  const parentId =
    input.parent_id === undefined
      ? undefined
      : requireString(input.parent_id, 'parent_id', { max: 512 });
  return {
    file_to_upload: {
      name: upload.fileName,
      mimetype: upload.mimeType,
      s3key: upload.providerKey,
      ...(connectionId.startsWith('gw_')
        ? {
            byte_length: upload.byteLength,
            md5: upload.md5,
            sha256: upload.sha256,
          }
        : {}),
    },
    ...(parentId === undefined ? {} : { folder_to_upload_to: parentId }),
  };
}

function validateConnectorFileName(value: unknown): string {
  const fileName = requireString(value, 'fileName', { max: 255 });
  if (
    fileName !== fileName.trim() ||
    fileName === '.' ||
    fileName === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw new CloudError(400, 'invalid_connector_file', 'The upload filename is invalid');
  }
  return fileName;
}

function validateConnectorMimeType(value: unknown): string {
  const mimeType = requireString(value, 'mimeType', { max: 127 });
  if (mimeType !== mimeType.toLowerCase() || !CONNECTOR_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new CloudError(
      415,
      'unsupported_connector_file_type',
      'That file type is not supported',
    );
  }
  return mimeType;
}

function validateConnectorByteLength(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_CONNECTOR_UPLOAD_BYTES
  ) {
    throw new CloudError(
      413,
      'connector_file_too_large',
      `Drive uploads must be 1-${MAX_CONNECTOR_UPLOAD_BYTES} bytes`,
    );
  }
  return value;
}

function validateHash(value: unknown, label: string, pattern: RegExp): string {
  const hash = requireString(value, label, { max: 128 });
  if (!pattern.test(hash)) {
    throw new CloudError(400, 'invalid_connector_file', `${label} is invalid`);
  }
  return hash;
}
