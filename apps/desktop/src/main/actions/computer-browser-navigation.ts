import { randomUUID } from 'node:crypto';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { refused, stale } from './action-results.js';
import { windowBackgroundInput } from './background-input.js';
import type { ComputerWindowBinding, NativeElementAddress } from './computer-grants.js';
import type { ComputerInventory } from './computer-inventory.js';
import type { ActionBackendContext } from './context.js';
import {
  findElementRecords,
  firstString,
  isSafariTabControl,
  sanitizeElement,
  trustedElementLabel,
  windowHasProtectedControls,
} from './driver-records.js';

/** Native Tab Overview has no page URL. Expose only native tab selection, never previews. */
export async function captureBrowserNavigation(
  ctx: ActionBackendContext,
  inventory: ComputerInventory,
  binding: ComputerWindowBinding,
  request: ValidatedActionInvocation,
  raw: unknown,
  surface: 'safari-tab-overview' | 'safari-tabs',
): Promise<ActionExecutionResult> {
  if (request.arguments.expected_url)
    return stale('This snapshot contains Safari tab labels, not the requested webpage.');
  const after = await inventory.nativeBrowserState(binding, surface === 'safari-tabs');
  if (after.status !== 'navigation' || after.surface !== surface)
    return stale('Safari tab navigation changed during observation. Capture its fresh state.');
  const snapshotId = randomUUID();
  const addresses = new Map<string, NativeElementAddress>();
  const elements = findElementRecords(raw, 'window').flatMap((record, position) => {
    if (
      !isSafariTabControl(record) ||
      windowHasProtectedControls({ elements: [record] }, { browserBundleId: after.bundleID })
    )
      return [];
    const token = firstString(record, ['element_token', 'elementToken']);
    if (!token) return [];
    const ref = `w:${snapshotId}:${position}`;
    const label = trustedElementLabel(record);
    addresses.set(ref, { token, role: 'AXRadioButton', ...(label ? { label } : {}) });
    const element = sanitizeElement(record, ref);
    delete element.frame;
    delete element.value;
    return [element];
  });
  if (!elements.length)
    return refused('Safari returned no verified native tab-selection controls.');
  const backgroundInput = windowBackgroundInput(raw, binding);
  ctx.computer.rememberSnapshot({
    id: snapshotId,
    appId: binding.appId,
    publicWindowId: binding.id,
    pid: binding.pid,
    windowId: binding.windowId,
    capturedAt: Date.now(),
    protectedControls: false,
    browserSurface: after.surface,
    ...(backgroundInput ? { backgroundInput } : {}),
    elements: addresses,
  });
  return {
    outcome: 'verified',
    summary:
      'Read Safari tab labels and selection controls. No webpage content or previews were returned.',
    data: {
      snapshot_id: snapshotId,
      app_id: binding.appId,
      window_id: binding.id,
      title: 'Safari tabs',
      browser_surface: after.surface,
      elements,
      background_input: backgroundInput,
      pixel_actions_available: false,
      observation_partial: true,
      coverage_note:
        'Native tab labels only; they do not establish page content or sign-in. Select the intended tab by its element_ref, then verify its live page. Only a single left click on a returned tab is allowed; Tab Overview also allows Escape. Screenshots, previews, text fields and other controls are excluded.',
    },
    verification: {
      snapshotId,
      evidence:
        'Exact Safari window and native tab navigation verified before and after capture.',
    },
  };
}
