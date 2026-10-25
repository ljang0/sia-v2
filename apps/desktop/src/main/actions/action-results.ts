/** Builds the ActionExecutionResult shapes the backend returns, and classifies driver refusals. */

import type { ActionExecutionResult } from '@sia/action-gateway';
import { isCuaCallResult } from '../mac/cua-service.js';
import { asRecord, compact, findNestedString, findString } from './driver-records.js';

export function refused(reason: string): ActionExecutionResult {
  return { outcome: 'refused', summary: reason, reason };
}

export function stale(reason: string): ActionExecutionResult {
  return { outcome: 'stale', summary: reason, reason };
}

/** Only these explicit validation/authorization refusals prove that no input was posted. */
export function inputWasRefused(error: unknown): boolean {
  return /^(?:CUA refused: )?(?:permission_denied|authorization_denied|invalid_arguments|invalid_element|element_index_required|element_outside_target_window|stale_snapshot|snapshot_expired|session_ended|background_unavailable|background_focus_unavailable|foreground_app_in_use|window_not_key|off_space_or_ax_unresolved|minimized_or_hidden_window|same_pid_keyboard_ambiguity|secure_field|protected_window|browser_ref_stale|browser_frame_changed|browser_tab_not_found|browser_binding_stale|browser_consent_required|browser_requires_setup|browser_input_trust_unavailable|browser_action_unavailable)$/.test(
    safeErrorMessage(error),
  );
}

export function classifyFailure(error: unknown): ActionExecutionResult {
  const message = safeErrorMessage(error);
  const normalized = message.toLowerCase();
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
  const refusal = findString(value, ['refusal', 'error_code', 'errorCode']);
  const code = findString(value, ['code']);
  const effect = findString(value, ['effect']);
  if (!refusal && effect !== 'refused' && !looksLikeErrorCode(code)) return undefined;
  const reason =
    refusal ??
    code ??
    findString(record, ['message', 'status']) ??
    'The driver refused the action.';
  return classifyFailure(new Error(reason));
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
        blocker_code:
          record?.background_focus_changed === true || restoredFocus
            ? 'background_focus_changed'
            : 'background_focus_unverified',
      },
    };
  }
  const refusalResult = resultRefusal(value);
  if (refusalResult) return refusalResult;
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
