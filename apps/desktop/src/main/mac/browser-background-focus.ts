export interface ForegroundWindow {
  readonly pid: number;
  readonly windowId: number;
}

/** Allows exact tab input or connection reuse; never native keys or browser setup. */
export function permitsOtherBrowserWindow(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  target: { readonly backgroundTargetPid?: number; readonly backgroundTargetWindowId?: number },
  foreground: ForegroundWindow | undefined,
): foreground is ForegroundWindow {
  const targetWindowId = target.backgroundTargetWindowId;
  if (
    !foreground ||
    !Number.isInteger(foreground.pid) ||
    foreground.pid <= 0 ||
    foreground.pid > 2_147_483_647 ||
    !Number.isInteger(foreground.windowId) ||
    foreground.windowId <= 0 ||
    foreground.windowId > 4_294_967_295 ||
    foreground.pid !== target.backgroundTargetPid ||
    typeof targetWindowId !== 'number' ||
    !Number.isInteger(targetWindowId) ||
    targetWindowId <= 0 ||
    targetWindowId > 4_294_967_295 ||
    foreground.windowId === targetWindowId
  )
    return false;
  if (tool === 'browser_prepare') {
    const strategy = args.strategy;
    return (
      args.reuse_only === true &&
      args.delivery_mode === 'background' &&
      args.pid === target.backgroundTargetPid &&
      args.window_id === targetWindowId &&
      typeof strategy === 'object' &&
      strategy !== null &&
      'kind' in strategy &&
      strategy.kind === 'existing_profile'
    );
  }
  if (
    typeof args.target_id !== 'string' ||
    !args.target_id ||
    typeof args.tab_id !== 'string' ||
    !args.tab_id ||
    (args.delivery_mode !== 'background' &&
      !(tool === 'browser_navigate' && args.delivery_mode === undefined))
  )
    return false;
  return (
    tool === 'browser_navigate' ||
    (['browser_click', 'browser_type', 'browser_pointer'].includes(tool) &&
      typeof args.visual_document === 'string' &&
      /^[a-f0-9]{64}$/.test(args.visual_document))
  );
}
