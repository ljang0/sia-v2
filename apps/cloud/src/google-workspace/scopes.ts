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

/**
 * Calendar and Tasks were added after people had already saved Workspace grants. They are
 * requested with every new grant but never required for a connection to count as connected or
 * for its access level; each Calendar or Tasks tool checks its own scope before calling Google.
 */
export const GOOGLE_WORKSPACE_OPTIONAL_READ_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
] as const;

export const GOOGLE_WORKSPACE_OPTIONAL_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
] as const;

/** Scopes a grant must hold to be stored and reported at the given access level. */
export function scopesForAccess(access: GoogleAccessLevel): readonly string[] {
  return access === 'read_write' ? GOOGLE_WORKSPACE_WRITE_SCOPES : GOOGLE_WORKSPACE_READ_SCOPES;
}

/** Everything the consent screen asks for: the required scopes plus the optional services. */
export function requestedScopesForAccess(access: GoogleAccessLevel): readonly string[] {
  return access === 'read_write'
    ? [...GOOGLE_WORKSPACE_WRITE_SCOPES, ...GOOGLE_WORKSPACE_OPTIONAL_WRITE_SCOPES]
    : [...GOOGLE_WORKSPACE_READ_SCOPES, ...GOOGLE_WORKSPACE_OPTIONAL_READ_SCOPES];
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
      'https://www.googleapis.com/auth/calendar.events.readonly':
        'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks.readonly': 'https://www.googleapis.com/auth/tasks',
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
    case 'calendar.list_events':
    case 'calendar.read_event':
      return [
        [
          'https://www.googleapis.com/auth/calendar.events.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ],
      ];
    case 'calendar.create_event':
    case 'calendar.update_event':
    case 'calendar.delete_event':
      return [['https://www.googleapis.com/auth/calendar.events']];
    case 'tasks.list':
      return [
        [
          'https://www.googleapis.com/auth/tasks.readonly',
          'https://www.googleapis.com/auth/tasks',
        ],
      ];
    case 'tasks.create':
    case 'tasks.update':
      return [['https://www.googleapis.com/auth/tasks']];
    default:
      return [];
  }
}

/** Plain-language service name for a tool whose scope is optional on existing grants. */
export function optionalScopeService(
  tool: ToolName,
): 'Google Calendar' | 'Google Tasks' | undefined {
  if (tool.startsWith('calendar.')) return 'Google Calendar';
  if (tool.startsWith('tasks.')) return 'Google Tasks';
  return undefined;
}
