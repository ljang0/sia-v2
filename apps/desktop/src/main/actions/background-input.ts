import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { stale } from './action-results.js';
import type { ComputerWindowBinding } from './computer-grants.js';
import { asRecord } from './driver-records.js';

export type BackgroundInputRoute = 'accessibility' | 'window_pointer' | 'pid_keyboard';
export interface BackgroundInputStatus {
  readonly exact_window: { readonly status: string };
  readonly routes: readonly {
    readonly route: BackgroundInputRoute;
    readonly status: 'available' | 'refused';
    readonly reason?: string;
  }[];
}

// Read only the SDK's structured payload, never page text or descendant elements.
// This is advisory availability: CUA still revalidates the exact target on every input.
export function windowBackgroundInput(
  value: unknown,
  target: Pick<ComputerWindowBinding, 'pid' | 'windowId'>,
): BackgroundInputStatus | undefined {
  const raw = asRecord(value)?.background_input;
  if (raw === undefined) return undefined;
  const report = asRecord(raw);
  const exact = asRecord(report?.exact_window);
  const routeNames = ['accessibility', 'window_pointer', 'pid_keyboard'] as const;
  const invalid: BackgroundInputStatus = {
    exact_window: { status: 'unverified' },
    routes: routeNames.map((route) => ({
      route,
      status: 'refused',
      reason: 'unverified_window_input',
    })),
  };
  if (
    exact?.pid !== target.pid ||
    exact?.window_id !== target.windowId ||
    !['matched', 'not_found', 'owner_mismatch', 'ax_unresolved'].includes(
      String(exact?.status),
    ) ||
    !Array.isArray(report?.routes) ||
    report.routes.length !== routeNames.length
  )
    return invalid;
  const routes: BackgroundInputStatus['routes'][number][] = [];
  for (const name of routeNames) {
    const matches = report.routes.map(asRecord).filter((route) => route?.route === name);
    const entry = matches[0];
    if (
      matches.length !== 1 ||
      !entry ||
      !['available', 'refused'].includes(String(entry.status))
    )
      return invalid;
    // An unresolved/foreign window can never advertise usable background input.
    if (exact.status !== 'matched' && entry.status !== 'refused') return invalid;
    routes.push({
      route: name,
      status: entry.status as 'available' | 'refused',
      ...(entry.status === 'refused' &&
      typeof entry.reason === 'string' &&
      /^[a-z_]{1,80}$/.test(entry.reason)
        ? { reason: entry.reason }
        : {}),
    });
  }
  return { exact_window: { status: String(exact.status) }, routes };
}

export function windowInputRecovery(request: ValidatedActionInvocation): string {
  return request.context.backgroundOnly
    ? 'This window is observation-only for the unavailable background routes. Foreground recovery is disabled for this turn. Do not retry pixels or keys when their route is refused. The person can bring the app onto this desktop or allow brief foreground control in Settings → Computer for a new request.'
    : 'For an unavailable background route, brief foreground recovery is permitted. Use computer_open_app with the installed application id and delivery:"foreground", then inspect the exact intended window again before continuing. Prefer a supported background route afterward. Never replay an uncertain send or other write.';
}

export function backgroundRouteRefusal(
  report: BackgroundInputStatus | undefined,
  route: BackgroundInputRoute,
  request: ValidatedActionInvocation,
): ActionExecutionResult | undefined {
  const status = report?.routes.find((entry) => entry.route === route);
  if (!status || status.status === 'available') return undefined;
  if (['not_found', 'owner_mismatch', 'unverified'].includes(report!.exact_window.status))
    return stale(
      'The driver could not verify this exact window for input. Discover and inspect the intended window again.',
    );
  return {
    outcome: 'needs_foreground',
    summary: `The ${route} background route is unavailable; no input was attempted.`,
    reason: status.reason ?? 'background_input_unavailable',
    data: { background_input: report, next_step: windowInputRecovery(request) },
  };
}
