import type { ActionExecutionResult } from '@sia/action-gateway';
import { isCuaCallResult } from '../cua-service.js';
import { asRecord, compact, findNestedString, findString } from './driver-records.js';

export function refused(reason: string): ActionExecutionResult {
  return { outcome: 'refused', summary: reason, reason };
}

export function stale(reason: string): ActionExecutionResult {
  return { outcome: 'stale', summary: reason, reason };
}

export function classifyFailure(error: unknown): ActionExecutionResult {
  const message = safeErrorMessage(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('stale') ||
    normalized.includes('superseded') ||
    (normalized.includes('snapshot') && normalized.includes('expired')) ||
    (normalized.includes('ref') && normalized.includes('invalid'))
  ) {
    return stale(message);
  }
  if (
    /\b(off_space_or_ax_unresolved|minimized_or_hidden_window|same_pid_keyboard_ambiguity)\b/.test(
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
      data: { effect, delivery_mode: deliveryMode },
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
