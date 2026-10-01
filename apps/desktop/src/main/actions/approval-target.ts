import { stringValue } from './arguments.js';
import type { BrowserGrants } from './browser-grants.js';
import { browserUrlLooksSensitive, declaredOrigin } from './browser-urls.js';
import type { ComputerGrants } from './computer-grants.js';

/**
 * Resolves a model-supplied ref against host-owned snapshot capabilities for
 * the approval UI. Labels and roles come only from the trusted CUA snapshot;
 * model-supplied presentation strings are never used.
 */
export function trustedApprovalTarget(
  computer: ComputerGrants,
  browser: BrowserGrants,
  toolName: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): string | undefined {
  if (toolName === 'computer_open_url') {
    const value = stringValue(argumentsValue.url);
    if (!value) return undefined;
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        browserUrlLooksSensitive(url.toString())
      )
        return undefined;
      return `Open ${url.origin} in the default browser`;
    } catch {
      return undefined;
    }
  }
  if (toolName === 'computer_action') {
    const snapshotId = stringValue(argumentsValue.snapshot_id);
    const windowId = stringValue(argumentsValue.window_id);
    const appId = stringValue(argumentsValue.app_id);
    const ref = stringValue(argumentsValue.element_ref);
    const action = stringValue(argumentsValue.action);
    const snapshot = snapshotId ? computer.snapshots.get(snapshotId) : undefined;
    const window = windowId ? computer.windows.get(windowId) : undefined;
    const app = appId ? computer.apps.get(appId) : undefined;
    const element = snapshot && ref ? snapshot.elements.get(ref) : undefined;
    if (
      !snapshot ||
      !window ||
      !app ||
      !appId ||
      !windowId ||
      !snapshotId ||
      !action ||
      (ref
        ? !element
        : !(
            ['type', 'key', 'scroll'].includes(action) ||
            (snapshot.pixels && ['click', 'drag'].includes(action))
          )) ||
      snapshot.appId !== appId ||
      snapshot.publicWindowId !== windowId ||
      window.appId !== appId ||
      computer.latestSnapshot.get(windowId) !== snapshotId ||
      app.expiresAt <= Date.now() ||
      window.expiresAt <= Date.now()
    ) {
      return undefined;
    }
    const windowLabel = window.title ? `, window “${window.title}”` : '';
    return element && ref
      ? `${app.name}${windowLabel}: ${action} ${approvalElementLabel(element, ref)}`
      : `${app.name}${windowLabel}: ${action} ${typeof argumentsValue.x === 'number' ? `at screenshot pixel (${argumentsValue.x}, ${argumentsValue.y})${action === 'drag' ? ` to (${argumentsValue.to_x}, ${argumentsValue.to_y})` : ''}` : 'the currently focused control'}`;
  }
  if (toolName === 'browser_action' || toolName === 'browser_upload') {
    const snapshotId = stringValue(argumentsValue.snapshot_id);
    const tabId = stringValue(argumentsValue.tab_id);
    const ref = stringValue(argumentsValue.element_ref);
    const snapshot = snapshotId ? browser.snapshots.get(snapshotId) : undefined;
    const binding = tabId ? browser.bindings.get(tabId) : undefined;
    if (
      !snapshot ||
      !binding ||
      !tabId ||
      !snapshotId ||
      snapshot.tabId !== tabId ||
      snapshot.targetId !== binding.targetId ||
      browser.latestSnapshot.get(tabId) !== snapshotId ||
      declaredOrigin(argumentsValue.origin) !== snapshot.origin
    ) {
      return undefined;
    }
    const action =
      toolName === 'browser_upload'
        ? 'upload files through'
        : stringValue(argumentsValue.action) === 'click' && process.platform === 'darwin'
          ? 'click via an explicit page DOM event on'
          : stringValue(argumentsValue.action);
    const element = ref ? snapshot.elements.get(ref) : undefined;
    if (!action || !element || !ref) return undefined;
    return `${snapshot.origin}: ${action} ${approvalElementLabel(element, ref)}`;
  }
  return undefined;
}

function approvalElementLabel(
  element: { readonly label?: string; readonly role?: string },
  ref: string,
): string {
  const genericLabel =
    element.role === 'AXTextArea'
      ? 'text area'
      : element.role === 'AXTextField'
        ? 'text field'
        : 'unlabeled element';
  const label = element.label ? `“${element.label}”` : genericLabel;
  const detail = [element.role, `exact snapshot ref ${ref}`].filter(Boolean).join(', ');
  return `${label} (${detail})`;
}
