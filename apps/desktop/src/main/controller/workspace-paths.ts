/** Agent workspace and worktree path naming. */

import { normalize, resolve } from 'node:path';

export function normalizeWorkspace(value: string): string {
  return normalize(resolve(value));
}

export function workspaceSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'agent';
}

export function worktreeLabel(title: string, id: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'thread'}-${id}`;
}
