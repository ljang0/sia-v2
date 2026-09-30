import type { GoogleAccessLevel, ToolName } from '../contracts.js';

/** The first connection is deliberately read-only. Mutations use a separate upgrade grant. */
export const GOOGLE_WORKSPACE_READ_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
] as const;

/** Full editor access is requested only after a person explicitly chooses to enable writes. */
export const GOOGLE_WORKSPACE_WRITE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
] as const;

export function scopesForAccess(access: GoogleAccessLevel): readonly string[] {
  return access === 'read_write' ? GOOGLE_WORKSPACE_WRITE_SCOPES : GOOGLE_WORKSPACE_READ_SCOPES;
}

export function missingRequiredScopes(scopes: string[], access: GoogleAccessLevel): string[] {
  return scopesForAccess(access).filter((scope) => !scopeIsGranted(scopes, scope));
}

export function scopeIsGranted(scopes: readonly string[], required: string): boolean {
  const granted = new Set(scopes);
  // Google's token endpoint may canonicalize the OpenID Connect `email` alias.
  if (required === 'email') {
    return (
      granted.has('email') || granted.has('https://www.googleapis.com/auth/userinfo.email')
    );
  }
  // A full editor scope includes its read-only counterpart. No other neighboring scope is
  // accepted, so the desktop never claims a capability the grant cannot actually perform.
  const fullScope =
    {
      'https://www.googleapis.com/auth/documents.readonly':
        'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets.readonly':
        'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/presentations.readonly':
        'https://www.googleapis.com/auth/presentations',
    }[required] ?? required;
  return granted.has(required) || granted.has(fullScope);
}

export function googleAccessLevel(scopes: readonly string[]): GoogleAccessLevel {
  return missingRequiredScopes([...scopes], 'read_write').length === 0
    ? 'read_write'
    : 'read_only';
}

export function toolScopeRequirements(tool: ToolName): readonly (readonly string[])[] {
  switch (tool) {
    case 'mail.search':
    case 'mail.read_thread':
      return [['https://www.googleapis.com/auth/gmail.readonly']];
    case 'mail.create_draft':
    case 'mail.send':
      return [['https://www.googleapis.com/auth/gmail.compose']];
    case 'drive.search':
    case 'drive.read':
      return [['https://www.googleapis.com/auth/drive.readonly']];
    case 'drive.upload':
    case 'drive.share':
      return [['https://www.googleapis.com/auth/drive.file']];
    case 'docs.read':
      return [
        [
          'https://www.googleapis.com/auth/documents.readonly',
          'https://www.googleapis.com/auth/documents',
        ],
      ];
    case 'docs.create':
      return [
        ['https://www.googleapis.com/auth/documents'],
        ['https://www.googleapis.com/auth/drive.file'],
      ];
    case 'docs.append':
      return [['https://www.googleapis.com/auth/documents']];
    case 'sheets.read':
      return [
        [
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
        ],
      ];
    case 'sheets.create':
      return [
        ['https://www.googleapis.com/auth/spreadsheets'],
        ['https://www.googleapis.com/auth/drive.file'],
      ];
    case 'sheets.update':
    case 'sheets.append':
      return [['https://www.googleapis.com/auth/spreadsheets']];
    case 'slides.read':
      return [
        [
          'https://www.googleapis.com/auth/presentations.readonly',
          'https://www.googleapis.com/auth/presentations',
        ],
      ];
    case 'slides.create':
    case 'slides.append':
      return [['https://www.googleapis.com/auth/presentations']];
    default:
      return [];
  }
}
