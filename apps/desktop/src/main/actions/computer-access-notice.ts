import { randomUUID } from 'node:crypto';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import type { BrowserWindowState } from '../mac/browser-window.js';
import { refused, stale } from './action-results.js';
import { windowBackgroundInput } from './background-input.js';
import { browserUrlLooksSensitive } from './browser-urls.js';
import type { ComputerWindowBinding } from './computer-grants.js';
import type { ComputerInventory } from './computer-inventory.js';
import type { ActionBackendContext } from './context.js';
import {
  findElementRecords,
  firstString,
  isPassiveAuthenticationNotice,
  windowHasProtectedControls,
} from './driver-records.js';

function nativeReadProof(state: BrowserWindowState): boolean {
  if (state.status !== 'ready') return false;
  try {
    if (
      !['http:', 'https:'].includes(new URL(state.url).protocol) ||
      browserUrlLooksSensitive(state.url)
    )
      return false;
  } catch {
    return false;
  }
  return (
    state.pageHasNonSearchEditableControls === false &&
    state.authenticationControlsPresent === false
  );
}

export function hasPassiveAccessNotice(raw: unknown, state: BrowserWindowState): boolean {
  const records = findElementRecords(raw, 'window');
  let addressFields = 0;
  const nonSearchField = records.some((record) => {
    const role = firstString(record, ['role', 'type']) ?? '';
    if (!['AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField'].includes(role))
      return false;
    if (
      role === 'AXSearchField' ||
      (role === 'AXTextField' && record.subrole === 'AXSearchField')
    )
      return false;
    const label =
      [record.label, record.title].find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      ) ?? '';
    if (role === 'AXTextField' && /^(?:smart search field|address and search)$/i.test(label))
      return ++addressFields > 1;
    // Cua projects native AXSearchField controls as AXTextField without subrole.
    // The complete signed scans still must prove every page field is search;
    // this text-only capability returns no field values or input references.
    if (role === 'AXTextField' && /\bsearch\b/i.test(label)) return false;
    return true;
  });
  return (
    nativeReadProof(state) &&
    state.status === 'ready' &&
    !nonSearchField &&
    records.some(isPassiveAuthenticationNotice) &&
    !windowHasProtectedControls(raw, {
      browserBundleId: state.bundleID,
      allowPassiveAuthenticationNotice: true,
    })
  );
}

/** Read document prose without granting any page control, typing, pixels or auth interaction. */
export async function captureAccessNotice(
  ctx: ActionBackendContext,
  inventory: ComputerInventory,
  binding: ComputerWindowBinding,
  request: ValidatedActionInvocation,
  raw: unknown,
  state: BrowserWindowState,
): Promise<ActionExecutionResult> {
  if (state.status !== 'ready' || !hasPassiveAccessNotice(raw, state))
    return refused('The passive access-notice proof is unavailable.');
  const before = await inventory.nativeBrowserState(binding);
  if (
    !hasPassiveAccessNotice(raw, before) ||
    before.status !== 'ready' ||
    before.url !== state.url
  )
    return stale(
      'The document changed during observation. No contents or input grant returned.',
    );
  const context = await ctx.options.readWindowContext?.(binding.pid, binding.windowId);
  if (context?.status === 'protected')
    return {
      ...refused('Protected controls appeared. No contents or input grant returned.'),
      data: { blocker_code: 'protected_window' },
    };
  const after = await inventory.nativeBrowserState(binding);
  if (
    !hasPassiveAccessNotice(raw, after) ||
    after.status !== 'ready' ||
    after.url !== state.url
  )
    return stale(
      'The document changed during its text read. No contents or input grant returned.',
    );
  const text =
    context?.status === 'ready' &&
    context.bundleID.toLowerCase() === state.bundleID.toLowerCase()
      ? context.text
      : undefined;
  const id = randomUUID();
  const backgroundInput = windowBackgroundInput(raw, binding);
  ctx.computer.rememberSnapshot({
    id,
    appId: binding.appId,
    publicWindowId: binding.id,
    pid: binding.pid,
    windowId: binding.windowId,
    capturedAt: Date.now(),
    browserUrl: state.url,
    protectedControls: true,
    passiveAuthenticationNotice: true,
    elements: new Map(),
    ...(backgroundInput ? { backgroundInput } : {}),
  });
  const url = new URL(state.url);
  return {
    outcome: 'verified',
    summary:
      'Read document text with a passive access notice. No page controls, image or typing authority returned.',
    data: {
      snapshot_id: id,
      app_id: binding.appId,
      window_id: binding.id,
      source_url: url.origin + url.pathname,
      ...(text ? { visible_text: text } : {}),
      elements: [],
      read_only_access_notice: true,
      observation_partial: true,
      pixel_actions_available: false,
      background_input: backgroundInput,
      allowed_actions: ['scroll', 'new_tab'],
      coverage_note:
        'This is a limited document-text read. A passive notice for a linked resource does not establish the requested account needs sign-in. No authenticated account contents were verified. Missing text is not proof of absence.',
      next_step:
        'Read the available document text. Only exact-window scrolling or Cmd+T to a new tab is permitted when its background route is available. Observe the new tab normally before typing. Page clicks, typing, other keys, pixels and authentication interaction are blocked.',
    },
    verification: {
      snapshotId: id,
      evidence:
        'Signed native scans before and after the text read verified the same ordinary URL, no form fields other than search and no authentication controls. All page-field values, input refs, images and typing authority are withheld.',
    },
  };
}
