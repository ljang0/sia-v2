import { randomUUID } from 'node:crypto';
import type { ActionExecutionResult } from '@sia/action-gateway';
import { actionImages, refused, screenshotDimensions, stale } from './action-results.js';
import type { BrowserBinding, BrowserSnapshotCapability } from './browser-grants.js';
import type { ActionBackendContext } from './context.js';
import { asRecord } from './driver-records.js';

export interface BrowserImageGeometry {
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Native metadata is checked against the actual image; models always use image pixels. */
export function browserImageGeometry(raw: unknown): BrowserImageGeometry | undefined {
  const size = screenshotDimensions(raw);
  const metadata = asRecord(asRecord(raw)?.screenshot);
  if (
    !size ||
    !metadata ||
    metadata.source !== 'cdp_tab' ||
    metadata.scope !== 'viewport' ||
    metadata.coordinate_space !== 'viewport_css_px' ||
    metadata.width !== size.width ||
    metadata.height !== size.height
  )
    return undefined;
  const {
    pixel_to_css_scale_x: scaleX,
    pixel_to_css_scale_y: scaleY,
    viewport_css_width: width,
    viewport_css_height: height,
  } = metadata;
  if (
    [scaleX, scaleY, width, height].some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0,
    )
  )
    return undefined;
  if (
    Math.abs((width as number) / size.width - (scaleX as number)) > 1e-6 ||
    Math.abs((height as number) / size.height - (scaleY as number)) > 1e-6
  )
    return undefined;
  return { ...size, scaleX: scaleX as number, scaleY: scaleY as number };
}

/** Called only after the normal origin and protected-content checks. Never forwards raw fields. */
export function browserVisualSnapshot(
  ctx: ActionBackendContext,
  binding: BrowserBinding,
  raw: unknown,
  url: string,
  privateLinks: boolean,
): ActionExecutionResult {
  const image = actionImages(raw).images?.find((entry) => entry.mimeType === 'image/png');
  const pixels = browserImageGeometry(raw);
  const visualDocument = asRecord(asRecord(raw)?.screenshot)?.visual_document;
  if (
    privateLinks ||
    !image ||
    !pixels ||
    typeof visualDocument !== 'string' ||
    !/^[a-f0-9]{64}$/.test(visualDocument)
  )
    return {
      ...refused('A safe browser screenshot with verified coordinate mapping is unavailable.'),
      data: {
        control_mode: 'vision',
        blocker_code: 'visual_observation_unavailable',
        pixel_actions_available: false,
      },
    };
  const id = randomUUID();
  ctx.browser.rememberSnapshot({
    id,
    ...binding,
    origin: new URL(url).origin,
    url,
    capturedAt: Date.now(),
    visualDocument,
    pixels,
    elements: new Map(),
  });
  return {
    outcome: 'verified',
    summary: 'Captured the permitted browser viewport for visual control.',
    images: [image],
    data: {
      control_mode: 'vision',
      snapshot_id: id,
      tab_id: binding.tabId,
      origin: new URL(url).origin,
      screenshot_size: { width: pixels.width, height: pixels.height },
      pixel_actions_available: true,
      coverage_note: 'Only the visible screenshot is evidence. Scroll to inspect more content.',
    },
    verification: {
      snapshotId: id,
      evidence: 'Image bound to the permitted tab and its coordinate mapping.',
    },
  };
}

function permittedPageKey(value: unknown, modifiers: unknown): boolean {
  if (typeof value !== 'string' || (modifiers !== undefined && !Array.isArray(modifiers)))
    return false;
  const keys = (modifiers ?? []) as unknown[];
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !['cmd', 'shift', 'option'].includes(String(key)))
  )
    return false;
  const key = value.toLowerCase();
  const shifted = keys.includes('shift');
  if (shifted && key === 'escape') return false;
  const base = keys.filter((key) => key !== 'shift');
  if (!base.length)
    return (
      /^(?:[a-z0-9]|enter|return|tab|escape|up|down|left|right|space|delete|backspace|home|end|pageup|pagedown)$/.test(
        key,
      ) && !(shifted && /^[0-9]$/.test(key))
    );
  if (base.length !== 1) return false;
  if (base[0] === 'cmd')
    return (
      ['left', 'right', 'up', 'down', 'z'].includes(key) ||
      (!shifted && ['a', 'delete', 'backspace'].includes(key))
    );
  return ['left', 'right'].includes(key) || (!shifted && ['delete', 'backspace'].includes(key));
}

export function browserVisualInput(
  capability: BrowserSnapshotCapability,
  args: Readonly<Record<string, unknown>>,
): { tool: string; input: Record<string, unknown> } | ActionExecutionResult {
  const pixels = capability.pixels;
  if (
    !pixels ||
    !capability.visualDocument ||
    capability.capturedAt === undefined ||
    Date.now() - capability.capturedAt > 30_000
  )
    return stale('Capture a fresh browser screenshot before visual input.');
  if (args.element_ref !== undefined || args.replace === true || args.delivery === 'foreground')
    return refused(
      'Visual browser input accepts no semantic targets, setters or foreground fallback.',
    );
  if (args.action !== 'key' && Array.isArray(args.modifiers) && args.modifiers.length)
    return refused('Visual browser pointer and text input do not accept key modifiers.');
  const base = {
    session: capability.session,
    target_id: capability.targetId,
    tab_id: capability.tabId,
    delivery_mode: 'background',
    visual_document: capability.visualDocument,
  };
  if (args.action === 'key') {
    if (
      args.x !== undefined ||
      args.y !== undefined ||
      args.text !== undefined ||
      !permittedPageKey(args.value, args.modifiers)
    )
      return refused(
        'Use a supported page key or editing shortcut. Background keys cannot use the clipboard, browser-wide shortcuts or semantic targets.',
      );
    return {
      tool: 'browser_type',
      input: {
        ...base,
        mode: 'focused_key',
        text: String(args.value).toLowerCase(),
        modifiers: args.modifiers ?? [],
      },
    };
  }
  if (args.action === 'type') {
    if (typeof args.text !== 'string' || args.x !== undefined || args.y !== undefined)
      return refused(
        'Click the field from its screenshot, inspect focus, then type text without coordinates.',
      );
    return { tool: 'browser_type', input: { ...base, mode: 'focused', text: args.text } };
  }
  if (!['click', 'scroll', 'drag'].includes(String(args.action)))
    return refused(
      'This visual browser route supports coordinate clicks, scrolling, drag, page keys and typing into a visually focused field.',
    );
  const points =
    args.action === 'drag'
      ? [
          [args.x, args.y],
          [args.to_x, args.to_y],
        ]
      : [[args.x, args.y]];
  if (
    points.some(
      ([x, y]) =>
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x >= pixels.width ||
        y >= pixels.height,
    )
  )
    return stale('Choose points inside this fresh original browser screenshot.');
  const origin = {
    x: (args.x as number) * pixels.scaleX,
    y: (args.y as number) * pixels.scaleY,
  };
  if (args.action === 'click' && args.count !== 2 && args.button !== 'right')
    return { tool: 'browser_click', input: { ...base, ...origin, input_route: 'trusted' } };
  const input: Record<string, unknown> = {
    ...base,
    ...origin,
    input_route: 'trusted',
    action:
      args.action === 'click'
        ? args.button === 'right'
          ? 'right_click'
          : 'double_click'
        : args.action,
  };
  if (args.action === 'drag') {
    input.to_x = (args.to_x as number) * pixels.scaleX;
    input.to_y = (args.to_y as number) * pixels.scaleY;
  }
  if (args.action === 'scroll') {
    if (!['up', 'down', 'left', 'right'].includes(String(args.direction)))
      return refused('Choose a scroll direction.');
    if (
      args.amount !== undefined &&
      (typeof args.amount !== 'number' || !Number.isFinite(args.amount) || args.amount <= 0)
    )
      return refused('Choose a finite positive scroll amount.');
    const amount = typeof args.amount === 'number' ? Math.min(10000, args.amount) : 480;
    input.delta_x =
      args.direction === 'left' ? -amount : args.direction === 'right' ? amount : 0;
    input.delta_y = args.direction === 'up' ? -amount : args.direction === 'down' ? amount : 0;
  }
  return { tool: 'browser_pointer', input };
}
