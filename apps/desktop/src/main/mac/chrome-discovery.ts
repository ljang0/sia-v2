import type { BrowserWindowView } from '../../shared/bridge.js';
import { isRecord, stringField } from '../actions/records.js';

// Reads the Cua driver's and Chrome's loosely shaped output to find the person's Chrome,
// its windows and tabs, and turns attachment failures into plain guidance.

/** Every Chrome process, best-scored first; several can run at once (profiles, dev instances). */
export function findChromeCandidates(value: unknown): { pid: number }[] {
  const candidates = collectRecords(value)
    .map((candidate) => {
      const name = stringField(candidate, ['name', 'application_name', 'applicationName']);
      const bundleId = stringField(candidate, [
        'bundle_id',
        'bundleId',
        'bundle_identifier',
        'bundleIdentifier',
      ]);
      const pid = Number(candidate.pid);
      const normalizedName = name?.trim().toLowerCase() ?? '';
      const normalizedBundleId = bundleId?.trim().toLowerCase() ?? '';
      const helper = /\b(helper|crashpad)\b/.test(normalizedName);
      const score =
        normalizedBundleId === 'com.google.chrome'
          ? 4
          : normalizedName === 'google chrome'
            ? 3
            : normalizedBundleId.startsWith('com.google.chrome.') && !helper
              ? 2
              : normalizedName.includes('chrome') && !helper
                ? 1
                : 0;
      const active = candidate.active === true;
      return { candidate, pid, score, active };
    })
    .filter(({ pid, score }) => Number.isSafeInteger(pid) && pid > 0 && score > 0)
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return right.score - left.score;
    });
  const seen = new Set<number>();
  return candidates
    .filter(({ pid }) => (seen.has(pid) ? false : (seen.add(pid), true)))
    .map(({ pid }) => ({ pid }));
}

export function preferredChromeWindows(value: unknown): BrowserWindowView[] {
  const windows = collectRecords(value)
    .map((record) => ({
      id: Number(record.window_id ?? record.id),
      minimized: record.minimized === true || record.is_minimized === true,
      title: typeof record.title === 'string' ? record.title : '',
      visible: record.is_on_screen !== false,
      bounds: isRecord(record.bounds)
        ? {
            width: Number(record.bounds.width),
            height: Number(record.bounds.height),
          }
        : undefined,
      zIndex: Number(record.z_index ?? record.zIndex ?? 0),
    }))
    .filter(({ id, title, minimized, bounds }) => {
      const hasUsableBounds =
        !bounds ||
        (!Number.isFinite(bounds.width) && !Number.isFinite(bounds.height)) ||
        (bounds.width >= 500 && bounds.height >= 300);
      // The driver's is_on_screen flag is unreliable for windows on other Spaces and can
      // briefly read false for real visible windows, so it only affects ordering below;
      // background window operations address windows by id and do not need visibility.
      return (
        Number.isSafeInteger(id) &&
        id > 0 &&
        !minimized &&
        hasUsableBounds &&
        !/^allow remote debugging\?$/i.test(title.trim())
      );
    })
    .sort((left, right) => {
      if (left.visible !== right.visible) return left.visible ? -1 : 1;
      if (Boolean(left.title) !== Boolean(right.title)) return left.title ? -1 : 1;
      return right.zIndex - left.zIndex || left.id - right.id;
    });
  return windows.map(({ id, minimized, title }, index) => {
    const safeTitle = sanitizeChromeWindowTitle(title);
    const detail = [safeTitle, minimized ? 'Minimized' : undefined]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    return {
      id,
      label: `Chrome window ${index + 1}`,
      ...(detail ? { detail } : {}),
    };
  });
}

function sanitizeChromeWindowTitle(value: string): string | undefined {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return undefined;
  return sanitized.slice(0, 160);
}

export async function chromeDebugPortOwnerPid(
  runCommand: (file: string, args: readonly string[]) => Promise<string>,
): Promise<number | undefined> {
  try {
    const stdout = await runCommand('lsof', ['-nP', '-iTCP:9222', '-sTCP:LISTEN', '-Fp']);
    const match = stdout.split('\n').find((line) => line.startsWith('p'));
    const pid = match ? Number(match.slice(1)) : Number.NaN;
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

export function browserAttachmentError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Chrome attachment failed.';
  if (message.includes('browser_binding_ambiguous')) {
    return 'Chrome could not distinguish that window from another open window. Choose a window showing a unique page, or close the duplicate and retry.';
  }
  if (message.includes('browser_reconnect_exhausted')) {
    return 'Chrome is waiting for permission. Click Allow in the “Allow remote debugging?” prompt, then try again. This is a one-time Chrome security step.';
  }
  if (message.includes('browser_wrong_target_refused')) {
    return 'Chrome refused the connection. One-time fix: open chrome://inspect in Chrome, tick “Allow remote debugging” (port 9222), restart Chrome — after that Sia connects automatically. Or click Allow on Chrome’s prompt when it appears.';
  }
  return message;
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ['apps', 'windows', 'elements', 'structuredContent', 'data']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
    if (isRecord(nested)) {
      const records = collectRecords(nested);
      if (records.length) return records;
    }
  }
  return [value];
}

export function collectHttpOrigins(value: unknown): string[] {
  const origins = new Set<string>();
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    if (!isRecord(current)) return;
    const targetId =
      stringField(current, ['target_id', 'targetId', 'target', 'page_id', 'pageId']) ??
      inheritedTarget;
    const tabId =
      stringField(current, ['tab_id', 'tabId', 'tab', 'id']) ??
      (targetId ? stringField(current, ['page_id', 'pageId']) : undefined);
    if (tabId || targetId) {
      const candidate =
        stringField(current, ['url', 'origin', 'page_url', 'pageUrl', 'location']) ?? undefined;
      if (candidate) {
        try {
          const url = new URL(candidate);
          if (url.protocol === 'https:' || url.protocol === 'http:') origins.add(url.origin);
        } catch {
          // Ignore non-web and malformed tab locations.
        }
      }
    }
    for (const [key, nested] of Object.entries(current)) {
      if (
        depth < 2 ||
        [
          'tabs',
          'targets',
          'pages',
          'data',
          'structuredContent',
          'structured_content',
        ].includes(key)
      ) {
        visit(nested, targetId, depth + 1);
      }
    }
  };
  visit(value);
  return [...origins].sort();
}

export function findBrowserTarget(
  value: unknown,
): { targetId: string; tabId: string } | undefined {
  let found: { targetId: string; tabId: string } | undefined;
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (found || depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    if (!isRecord(current)) return;
    const targetId =
      stringField(current, ['target_id', 'targetId', 'target', 'page_id', 'pageId']) ??
      inheritedTarget;
    const tabId = stringField(current, ['tab_id', 'tabId', 'tab']);
    if (targetId && tabId) {
      found = { targetId, tabId };
      return;
    }
    for (const nested of Object.values(current)) visit(nested, targetId, depth + 1);
  };
  visit(value);
  return found;
}

export function directBrowserUrl(value: string): URL {
  const input = value.trim();
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Enter a valid website address.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS website without credentials in the address.');
  }
  return url;
}
