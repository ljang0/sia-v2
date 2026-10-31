export interface DriverResult {
  rawJson: string;
  structuredJson?: string;
  errorCode?: string;
  images?: Array<{ mimeType: string; dataBase64: string }>;
}

interface CuaDriverImage {
  readonly mimeType: string;
  readonly dataBase64: string;
}

export interface CuaCallResult {
  readonly value: unknown;
  readonly images: readonly CuaDriverImage[];
}

export function isCuaCallResult(value: unknown): value is CuaCallResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'value') &&
    Array.isArray((value as Record<string, unknown>).images)
  );
}

/** Classify only known guard messages; never return native page or target content. */
export function browserGuardRefusalCode(code: string, message = ''): string | undefined {
  if (code !== 'browser_action_unavailable') return undefined;
  if (message.includes("the chosen point's browsing context could not be checked"))
    return 'browser_point_context_unavailable';
  if (message.includes("the link's browsing context could not be checked"))
    return 'browser_link_context_unavailable';
  return undefined;
}

/** Decode native envelopes without exposing content-bearing failure payloads. */
export function decodeDriverResult(
  tool: string,
  args: Record<string, unknown>,
  result: DriverResult,
  progress: { started: number; completed: number },
): { value: unknown; nativeToolError: boolean } {
  if (result.errorCode) {
    const guardCode = browserGuardRefusalCode(
      result.errorCode,
      result.structuredJson ?? result.rawJson,
    );
    if (guardCode) throw new Error(`CUA refused: ${guardCode}`);
    if (
      tool === 'drag' &&
      result.errorCode === 'background_unavailable' &&
      (result.structuredJson ?? result.rawJson).includes('drag_and_drop_session')
    ) {
      // This arrives AFTER mouse-down/drag/release. Do not flatten it into
      // the pre-input refusal used for a missing background delivery route.
      throw new Error('CUA incomplete: background_drag_requires_pointer');
    }
    if (result.errorCode === 'browser_wrong_target_refused') {
      // Classify known native proof failures without logging page/clipboard
      // content, target identities, or the raw native error payload.
      const raw = result.structuredJson ?? result.rawJson;
      const hint = raw.includes('browser consent observation was truncated')
        ? 'consent_observation_incomplete'
        : /multiple.*consent|consent.*conflicting decisions/.test(raw)
          ? 'consent_identity_ambiguous'
          : raw.includes('consent did not settle')
            ? 'consent_not_settled'
            : 'target_unverified';
      console.warn(`[sia:cua-browser] native_refusal tool=${tool} hint=${hint}`);
    }
    if (result.errorCode === 'authorization_host_failed') {
      // Keep callback/transport diagnostics without recording resource identities,
      // URLs, request digests or the driver's potentially content-bearing message.
      const raw = result.structuredJson ?? result.rawJson;
      const hint = /CDP [A-Za-z.]+ timed out/.test(raw)
        ? 'browser_transport_timeout'
        : raw.includes('live top-level')
          ? 'browser_origin_unavailable'
          : raw.includes('request timed out')
            ? 'request_timeout'
            : /denied in (?:standard|bounded) mode/.test(raw)
              ? 'mode_denied'
              : 'unspecified';
      console.warn(
        `[sia:cua-authorization] native_refusal tool=${tool} hint=${hint} callback_started=${progress.started} callback_completed=${progress.completed}`,
      );
      if (
        tool === 'get_browser_state' &&
        hint === 'browser_transport_timeout' &&
        progress.started === 0
      )
        throw new Error('CUA refused: browser_observation_timeout');
    }
    throw new Error(`CUA refused: ${result.errorCode}`);
  }
  if (
    tool === 'get_window_state' &&
    args.include_screenshot === true &&
    !result.images?.length
  ) {
    // A valid AX observation can omit an unprovable screenshot. Preserve the
    // usable controls, but retain a content-free reason for live diagnostics.
    const raw = result.structuredJson ?? result.rawJson;
    const hint = raw.includes('direct_capture_consent_required')
      ? 'direct_capture_consent_required'
      : raw.includes('px_frame_mismatch')
        ? 'frame_mismatch'
        : raw.includes('px_capture_unavailable')
          ? 'capture_unavailable'
          : 'image_missing';
    console.warn(`[sia:cua-capture] screenshot_missing hint=${hint}`);
  }
  const json = result.structuredJson ?? result.rawJson;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    parsed = { text: json };
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'error_code' in parsed &&
    parsed.error_code === 'session_ended'
  )
    throw new Error('CUA refused: session_ended');
  // Some driver failures use an MCP envelope instead of errorCode. Its text
  // can contain app content, so never release it as an observation or error.
  const nativeToolError = isNativeToolError(parsed);
  if (nativeToolError && tool.startsWith('browser_')) {
    console.warn(
      `[sia:cua-browser] native_error tool=${tool} hint=${/CDP [A-Za-z.]+ timed out/.test(json) ? 'browser_transport_timeout' : 'unspecified'}`,
    );
  }
  if (nativeToolError) parsed = { native_tool_error: true };
  return { value: parsed, nativeToolError };
}

/** Live native inventory only; never infer focus from a window title or cached snapshot. */
export function readForegroundInventory(
  result: DriverResult,
): { status: 'ready'; pid: number } | { status: 'empty' | 'unavailable' } {
  try {
    if (result.errorCode) return { status: 'unavailable' };
    const parsed: unknown = JSON.parse(result.structuredJson ?? result.rawJson);
    if (isNativeToolError(parsed)) return { status: 'unavailable' };
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('apps' in parsed) ||
      !Array.isArray(parsed.apps)
    )
      return { status: 'unavailable' };
    if (
      parsed.apps.every(
        (value: unknown) =>
          !!value && typeof value === 'object' && 'active' in value && value.active === false,
      )
    )
      return { status: 'empty' };
    const active = (parsed.apps as unknown[]).filter(
      (value): value is Record<string, unknown> =>
        !!value && typeof value === 'object' && 'active' in value && value.active === true,
    );
    if (active.length !== 1) return { status: 'unavailable' };
    const pid: unknown = active[0]?.pid;
    return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && pid <= 2_147_483_647
      ? { status: 'ready', pid }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function isNativeToolError(value: unknown): boolean {
  return !!value && typeof value === 'object' && 'isError' in value && value.isError === true;
}

export function withDriverImages(value: unknown, images: DriverResult['images']): unknown {
  const safeImages = images?.filter(
    (image) =>
      /^image\/[a-z0-9.+-]+$/i.test(image.mimeType) &&
      image.dataBase64.length > 0 &&
      image.dataBase64.length <= 40_000_000,
  );
  if (!safeImages?.length) return value;
  return { value, images: safeImages.slice(0, 4) } satisfies CuaCallResult;
}
