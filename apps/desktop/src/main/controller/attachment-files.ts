/** How an attached local file is classified and previewed. */

import { extname } from 'node:path';
import type { AttachmentView } from '../../shared/bridge.js';

export function attachmentKind(path: string): AttachmentView['kind'] {
  const extension = extname(path).toLocaleLowerCase();
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'].includes(
      extension,
    )
  ) {
    return 'image';
  }
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus'].includes(extension)) {
    return 'audio';
  }
  return 'file';
}

export function previewImageMimeType(path: string): string | undefined {
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  }[extname(path).toLocaleLowerCase()];
}

export function textAttachmentPreview(
  extension: string,
): { format: 'text' | 'code' | 'diff' | 'csv'; language?: string } | undefined {
  if (extension === '.csv' || extension === '.tsv') {
    return { format: 'csv', language: extension.slice(1).toUpperCase() };
  }
  if (extension === '.diff' || extension === '.patch') {
    return { format: 'diff', language: 'Diff' };
  }
  const languages: Readonly<Record<string, string>> = {
    '.css': 'CSS',
    '.go': 'Go',
    '.html': 'HTML',
    '.js': 'JavaScript',
    '.json': 'JSON',
    '.jsx': 'JSX',
    '.py': 'Python',
    '.rb': 'Ruby',
    '.rs': 'Rust',
    '.sh': 'Shell',
    '.sql': 'SQL',
    '.toml': 'TOML',
    '.ts': 'TypeScript',
    '.tsx': 'TSX',
    '.xml': 'XML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  };
  if (languages[extension]) return { format: 'code', language: languages[extension] };
  if (['.log', '.md', '.txt'].includes(extension)) return { format: 'text' };
  return undefined;
}
