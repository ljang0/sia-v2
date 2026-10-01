import type { ThreadEventEnvelope } from '@sia/protocol';
import type { ActivityPresentationView } from '../../shared/bridge.js';
import { imageActivityTitle } from '../../shared/activity-label.js';

// Maps runtime tool events to the activity titles and presentations the timeline shows.

export function humanizeToolName(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const RUNTIME_TOOL_LABELS: Record<string, string> = {
  websearch: 'Searching the web',
  browser_tabs: 'Checking browser tabs',
  browser_snapshot: 'Reading the page',
  browser_navigate: 'Opening a page',
  browser_action: 'Acting in the browser',
  browser_upload: 'Uploading a file',
  computer_list: 'Checking open apps',
  computer_open_app: 'Opening an app',
  computer_open_url: 'Opening a website',
  computer_list_files: 'Listing workspace files',
  computer_read_file: 'Reading a workspace file',
  computer_write_file: 'Saving a workspace report',
  computer_snapshot: 'Looking at a window',
  computer_action: 'Acting on the Mac',
};

export function runtimeToolTitle(
  name: string,
  presentation?: ActivityPresentationView,
): string {
  if (!presentation) {
    const label = RUNTIME_TOOL_LABELS[name.replace(/[.-]/g, '_').toLowerCase()];
    return label ?? humanizeToolName(name);
  }
  if (presentation.kind === 'command') return presentation.command;
  if (presentation.kind === 'file_change') {
    const count = presentation.files.length;
    if (count === 0) return 'Reviewing changes';
    return count === 1 ? `Changed ${presentation.files[0]!.path}` : `Changed ${count} files`;
  }
  if (presentation.kind === 'web_search') {
    return presentation.query ? `Searched for ${presentation.query}` : 'Searched the web';
  }
  if (presentation.kind === 'image') return imageActivityTitle(presentation.path);
  if (presentation.kind === 'review') return presentation.review || 'Code review';
  if (presentation.kind === 'compaction') return 'Compacted context';
  return humanizeToolName(name);
}

export function mapRuntimePresentation(
  presentation: Extract<ThreadEventEnvelope, { type: 'tool' }>['payload']['presentation'],
): ActivityPresentationView | undefined {
  if (!presentation) return undefined;
  if (presentation.kind === 'command') {
    return {
      kind: 'command',
      command: presentation.command,
      ...(presentation.cwd ? { cwd: presentation.cwd } : {}),
      ...(presentation.output ? { output: presentation.output } : {}),
      ...(presentation.exitCode !== undefined ? { exitCode: presentation.exitCode } : {}),
      ...(presentation.durationMs !== undefined ? { durationMs: presentation.durationMs } : {}),
      ...(presentation.processId !== undefined ? { processId: presentation.processId } : {}),
    };
  }
  if (presentation.kind === 'file_change') {
    return {
      kind: 'file_change',
      files: presentation.files.map((file) => ({
        path: file.path,
        change: file.change,
        ...(file.movePath ? { movePath: file.movePath } : {}),
        ...(file.diff ? { diff: file.diff } : {}),
      })),
    };
  }
  if (presentation.kind === 'web_search') {
    return {
      kind: 'web_search',
      ...(presentation.query ? { query: presentation.query } : {}),
      sources: presentation.sources.map((source) => ({
        url: source.url,
        ...(source.title ? { title: source.title } : {}),
      })),
    };
  }
  return structuredClone(presentation);
}
