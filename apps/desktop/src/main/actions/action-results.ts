/** Builds the ActionExecutionResult shapes the backend returns, and classifies driver refusals. */

import type { ActionExecutionResult } from '@sia/action-gateway';
import { BrowserAttestationError } from '../mac/browser-attestation.js';
import { browserGuardRefusalCode, isCuaCallResult } from '../mac/cua-results.js';
import { asRecord, compact, findNestedString, findString } from './driver-records.js';

export function refused(reason: string): ActionExecutionResult {
  return { outcome: 'refused', summary: reason, reason };
}

export function stale(reason: string): ActionExecutionResult {
  return { outcome: 'stale', summary: reason, reason };
}

/** An old public identifier is not evidence that the OS denied access. */
export function unresolvedComputerWindow(): ActionExecutionResult {
  return {
    outcome: 'stale',
    summary:
      'These app/window IDs are missing, expired, or no longer match the window. This does not mean macOS permission was denied. No input was sent.',
    reason: 'computer_window_ids_stale',
    data: {
      blocker_code: 'computer_window_ids_stale',
      input_not_sent: true,
      next_step:
        'Call computer_list for current IDs, identify the same intended window, then take computer_snapshot with those IDs. Do not reuse transcript IDs or request permission unless fresh evidence reports missing access. Do not replay earlier uncertain input.',
    },
  };
}

/** Only these explicit validation/authorization refusals prove that no input was posted. */
export function inputWasRefused(error: unknown): boolean {
  if (error instanceof BrowserAttestationError) return true;
  if (
    /^(?:CUA refused: )?browser_(?:point|link)_context_unavailable$/.test(
      safeErrorMessage(error),
    )
  )
    return true;
  return /^(?:CUA refused: )?(?:permission_denied|authorization_denied|invalid_arguments|invalid_element|element_index_required|element_outside_target_window|stale_snapshot|snapshot_expired|session_ended|background_unavailable|background_focus_unavailable|background_input_paused|foreground_app_in_use|window_not_key|no_focused_text_input|off_space_or_ax_unresolved|minimized_or_hidden_window|same_pid_keyboard_ambiguity|secure_field|protected_window|browser_ref_stale|browser_frame_changed|browser_tab_not_found|browser_binding_stale|browser_consent_required|browser_requires_setup|browser_action_unavailable|browser_new_context_refused)$/.test(
    safeErrorMessage(error),
  );
}

/** The driver can report this after a click has already changed the page. */
export function browserInputTrustFailure(error: unknown): ActionExecutionResult | undefined {
  if (/^(?:CUA refused: )?browser_input_incomplete$/.test(safeErrorMessage(error)))
    return {
      outcome: 'accepted_unverified',
      summary:
        'Browser input or cleanup was incomplete. Input may have arrived; inspect a fresh screenshot without replaying the action.',
      data: { input_delivery_uncertain: true, blocker_code: 'browser_input_incomplete' },
    };
  if (!/^(?:CUA refused: )?browser_input_trust_unavailable$/.test(safeErrorMessage(error)))
    return undefined;
  return {
    outcome: 'accepted_unverified',
    summary:
      'Browser input trust could not be verified, but the action may already have taken effect. Read the exact tab to check the result; do not replay the action or switch input routes.',
    data: { input_delivery_uncertain: true, blocker_code: 'browser_input_trust_unavailable' },
  };
}

export function classifyFailure(error: unknown): ActionExecutionResult {
  if (error instanceof BrowserAttestationError)
    return {
      outcome: 'refused',
      summary:
        'The chosen browser connection could not be verified before this action, so no input was sent. Refresh the same window’s connection state before continuing. Only repeat connection setup if it reports missing consent; do not switch windows or replay earlier actions with uncertain results.',
      reason: error.message,
      data: { blocker_code: error.code, input_not_sent: true },
    };
  const message = safeErrorMessage(error);
  const normalized = message.toLowerCase();
  if (/^(?:cua refused: )?browser_(?:point|link)_context_unavailable$/.test(normalized))
    return {
      outcome: 'refused',
      summary:
        'No click was sent because the link or pointer target could not be checked for opening another window. Do not repeat this click. Inspect the page and use permitted visible keyboard navigation or a known public destination in the existing tab; report the gap if neither is available.',
      reason: message,
      data: { blocker_code: normalized.replace(/^cua refused: /, ''), input_not_sent: true },
    };
  if (/^(?:cua refused: )?browser_input_incomplete$/.test(normalized))
    return browserInputTrustFailure(error)!;
  if (/^(?:cua refused: )?browser_new_context_refused$/.test(normalized))
    return {
      outcome: 'refused',
      summary:
        'No click was sent because this link opens another tab or window and could interrupt your work. Use computer_open_url only with a permitted destination already visible in the screenshot or supplied by the person to navigate the existing tab. If no destination is known, report this blocked step; do not extract hidden link targets. Do not retry this click or switch to foreground input.',
      reason: message,
      data: { blocker_code: 'browser_new_context_refused', input_not_sent: true },
    };
  if (normalized === 'cua refused: browser_observation_timeout')
    return {
      outcome: 'refused',
      summary:
        'The browser page did not respond after one bounded read retry. This does not mean permission was denied. Pause this task and report the loading problem. Once the page responds, continue by observing the same tab; do not repeat setup or replay earlier navigation or input whose result is uncertain.',
      reason: message,
      data: { blocker_code: 'browser_observation_timeout' },
    };
  if (normalized === 'cua refused: authorization_host_failed')
    return {
      outcome: 'refused',
      summary:
        'Computer access could not be authorized. This is an access-check failure, not evidence that a website needs sign-in. Stop this task and report the failure; do not repeat setup or replay an action with an uncertain result.',
      reason: message,
      data: { blocker_code: 'authorization_host_failed' },
    };
  if (normalized === 'cua refused: background_input_paused')
    return {
      outcome: 'needs_foreground',
      summary: 'No further input was sent because computer input is paused for this turn.',
      data: {
        background_interrupted: true,
        input_paused_for_turn: true,
        blocker_code: 'background_input_paused',
      },
    };
  if (/^(?:cua refused: )?window_not_key$/.test(normalized))
    return {
      outcome: 'refused',
      summary:
        'Keyboard focus could not be established in this window; no keys were sent. This does not mean Mac permission is missing or all background controls are unavailable.',
      reason: message,
      data: {
        blocker_code: 'window_not_key',
        keyboard_input_not_sent: true,
        next_step:
          'Observe the same intended window again. If its fresh screenshot confirms the current state and an available background route, choose another visible control or dialog for the same task. Do not replay uncertain input, change permissions, or switch to foreground delivery.',
      },
    };
  if (/\b(?:foreground_app_in_use|background_focus_unavailable)\b/.test(normalized)) {
    return {
      outcome: 'needs_foreground',
      summary: normalized.includes('foreground_app_in_use')
        ? 'No input was sent because you are using this app. Sia paused to leave your work alone.'
        : 'No input was sent because Sia could not verify which app you are using.',
      reason: message,
      data: {
        background_interrupted: true,
        blocker_code: normalized.includes('foreground_app_in_use')
          ? 'foreground_app_in_use'
          : 'background_focus_unavailable',
      },
    };
  }
  if (
    normalized.includes('stale') ||
    normalized.includes('superseded') ||
    (normalized.includes('snapshot') && normalized.includes('expired')) ||
    (normalized.includes('ref') && normalized.includes('invalid'))
  ) {
    return stale(message);
  }
  if (
    /\b(off_space_or_ax_unresolved|minimized_or_hidden_window|same_pid_keyboard_ambiguity|window_not_key)\b/.test(
      normalized,
    ) ||
    normalized.includes('foreground') ||
    normalized.includes('frontmost') ||
    (normalized.includes('background') && normalized.includes('unavailable'))
  ) {
    return {
      outcome: 'needs_foreground',
      summary: 'The action needs the foreground and was not attempted there.',
      reason: message,
    };
  }
  return refused(message);
}

export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'The action backend failed safely.';
  const message = error.message.trim();
  return message.length > 400
    ? `${message.slice(0, 397)}...`
    : message || 'The action backend failed safely.';
}

export function looksLikeErrorCode(value: string | undefined): boolean {
  return Boolean(
    value && /(?:error|refus|denied|invalid|stale|expired|not_found|unavailable)/i.test(value),
  );
}

export function resultRefusal(value: unknown): ActionExecutionResult | undefined {
  const record = asRecord(value);
  const refusal =
    findNestedString(value, 'error', ['code']) ??
    findNestedString(value, 'refusal', ['code', 'error_code', 'errorCode']) ??
    findString(value, ['refusal', 'error_code', 'errorCode']);
  const code = findString(value, ['code']);
  const effect = findString(value, ['effect']);
  if (
    !refusal &&
    record?.status !== 'refused' &&
    effect !== 'refused' &&
    !looksLikeErrorCode(code)
  )
    return undefined;
  const reason =
    refusal ??
    code ??
    findString(record, ['message', 'status']) ??
    'The driver refused the action.';
  const guardCode = browserGuardRefusalCode(
    reason,
    findNestedString(value, 'error', ['hint']) ??
      findNestedString(value, 'refusal', ['hint', 'message']),
  );
  return classifyFailure(new Error(guardCode ?? reason));
}

export function actionResult(
  value: unknown,
  summary: string,
  options: { allowForeground?: boolean } = {},
): ActionExecutionResult {
  const record = asRecord(value);
  const restoredFocus = !options.allowForeground && reportedFocusRestore(value);
  if (
    record?.background_focus_changed === true ||
    record?.background_focus_unverified === true ||
    restoredFocus
  ) {
    return {
      outcome: 'needs_foreground',
      summary:
        record?.background_focus_changed === true || restoredFocus
          ? 'Desktop focus changed during background input. Its effect needs verification; Sia paused and will not replay it.'
          : 'Input may have been delivered, but desktop focus could not be verified afterward. Sia paused; inspect the result before retrying.',
      data: {
        background_interrupted: true,
        input_delivery_uncertain: true,
        ...(record?.background_other_app_changed === true && !restoredFocus
          ? { background_other_app_changed: true }
          : {}),
        blocker_code:
          record?.background_focus_changed === true || restoredFocus
            ? 'background_focus_changed'
            : 'background_focus_unverified',
      },
    };
  }
  const refusalResult = resultRefusal(value);
  if (refusalResult)
    return (
      browserInputTrustFailure(new Error(refusalResult.reason ?? refusalResult.summary)) ??
      refusalResult
    );
  const effect = findString(value, ['effect']);
  const deliveryMode = findNestedString(value, 'delivery', ['mode']);
  const escalationTarget = findString(value, ['target'], (record) => 'reason' in record);
  if (deliveryMode === 'foreground' && !options.allowForeground) {
    return {
      outcome: 'needs_foreground',
      summary:
        'The driver reported unexpected foreground delivery for a background request. Its effect is uncertain; observe the window before doing anything else. Do not replay the action.',
      data: {
        effect,
        delivery_mode: deliveryMode,
        background_interrupted: true,
        input_delivery_uncertain: true,
      },
      reason: 'Foreground delivery was not requested by Sia.',
    };
  }
  if (escalationTarget === 'foreground') {
    return {
      outcome: 'accepted_unverified',
      summary:
        'Background input was attempted, but the driver could not verify its effect. Foreground takeover was not attempted. Inspect the fresh result before retrying or declaring failure.',
      data: compact({
        effect,
        delivery_mode: deliveryMode,
        background_verification_needed: true,
      }),
      reason:
        'An escalation suggestion is not proof that input failed. Never replay an uncertain write.',
    };
  }
  const data = compact({
    effect,
    route: findString(value, ['route']),
    delivery_mode: deliveryMode,
  });
  if (effect === 'confirmed') {
    return {
      outcome: 'verified',
      summary,
      data,
      verification: { evidence: 'Cua Driver reported a confirmed effect.' },
    };
  }
  return {
    outcome: 'accepted_unverified',
    summary,
    data,
    reason:
      effect === 'suspected_noop'
        ? 'The background action may have had no effect.'
        : 'The driver could not prove the requested semantic postcondition.',
  };
}

function reportedFocusRestore(value: unknown): boolean {
  let remaining = 256;
  const visit = (input: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 6) return false;
    if (Array.isArray(input)) return input.some((item) => visit(item, depth + 1));
    const record = asRecord(input);
    if (!record) return false;
    return (
      record.restored_frontmost_app === true ||
      record.foregrounded_window === true ||
      Object.values(record).some((item) => visit(item, depth + 1))
    );
  };
  return visit(value, 0);
}

export function actionImages(value: unknown): Pick<ActionExecutionResult, 'images'> {
  const images = isCuaCallResult(value) ? [...value.images] : [];
  return images.length ? { images: images.slice(0, 4) } : {};
}

export function terminalWithoutVerification(result: ActionExecutionResult): boolean {
  return (
    result.outcome === 'refused' ||
    result.outcome === 'stale' ||
    result.outcome === 'needs_foreground'
  );
}

export function screenshotDimensions(
  value: unknown,
): { width: number; height: number } | undefined {
  const image = actionImages(value).images?.find((image) => image.mimeType === 'image/png');
  if (!image) return undefined;
  const png = Buffer.from(image.dataBase64, 'base64');
  if (
    png.length < 24 ||
    png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    png.subarray(12, 16).toString() !== 'IHDR'
  )
    return undefined;
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 32768 && height <= 32768
    ? { width, height }
    : undefined;
}
