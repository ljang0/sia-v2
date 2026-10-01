import { isCuaCallResult } from '../cua-service.js';

// Cua Driver payloads are untrusted, loosely shaped JSON. These readers walk them with fixed
// depth limits and return only the plain fields Sia needs; nothing here mints capabilities.

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (isCuaCallResult(value)) return asRecord(value.value);
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) if (typeof record[key] === 'string') return record[key];
  return undefined;
}

export function firstBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) if (typeof record[key] === 'boolean') return record[key];
  return undefined;
}

export function findString(
  value: unknown,
  keys: readonly string[],
  recordPredicate?: (record: Record<string, unknown>) => boolean,
  depth = 0,
): string | undefined {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, recordPredicate, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (!recordPredicate || recordPredicate(record)) {
    const own = firstString(record, keys);
    if (own) return own;
  }
  for (const nested of Object.values(record)) {
    const found = findString(nested, keys, recordPredicate, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function findNestedString(
  value: unknown,
  containerKey: string,
  keys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedString(item, containerKey, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const container = asRecord(record[containerKey]);
  const own = container ? firstString(container, keys) : undefined;
  if (own) return own;
  for (const nested of Object.values(record)) {
    const found = findNestedString(nested, containerKey, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function findRecordArray(
  value: unknown,
  key: string,
  depth = 0,
): Record<string, unknown>[] {
  if (depth > 6) return [];
  const record = asRecord(value);
  if (record) {
    const direct = record[key];
    if (Array.isArray(direct)) return direct.map(asRecord).filter(isDefined);
    for (const nested of Object.values(record)) {
      const found = findRecordArray(nested, key, depth + 1);
      if (found.length) return found;
    }
  } else if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findRecordArray(nested, key, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

export function findElementRecords(
  value: unknown,
  kind: 'window' | 'browser',
): Record<string, unknown>[] {
  const candidates = [
    ...(kind === 'browser' ? findRecordArray(value, 'refs') : []),
    ...findRecordArray(value, 'elements'),
    ...findRecordArray(value, 'nodes'),
  ];
  return candidates.filter((record) =>
    kind === 'window'
      ? firstString(record, ['role', 'type']) !== undefined ||
        firstString(record, ['element_token', 'elementToken']) !== undefined ||
        nonNegativeInteger(record.element_index ?? record.elementIndex) !== undefined
      : firstString(record, ['ref', 'element_ref', 'elementRef']) !== undefined,
  );
}

export function collectTabRecords(value: unknown): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    const record = asRecord(current);
    if (!record || seen.has(record)) return;
    seen.add(record);
    const targetId = firstString(record, ['target_id', 'targetId']) ?? inheritedTarget;
    const tabId = firstString(record, ['tab_id', 'tabId']);
    if (tabId && targetId) output.push({ ...record, target_id: targetId });
    for (const [key, nested] of Object.entries(record)) {
      if (
        depth < 2 ||
        [
          'tabs',
          'targets',
          'pages',
          'data',
          'structuredContent',
          'structured_content',
          'browser',
        ].includes(key)
      ) {
        visit(nested, targetId, depth + 1);
      }
    }
  };
  visit(value);
  return output;
}

export function sanitizeElement(
  record: Record<string, unknown>,
  ref?: string,
): Record<string, unknown> {
  const states = asRecord(record.states);
  return compact({
    element_ref: ref,
    role: firstString(record, ['role', 'type']),
    label: trustedElementLabel(record),
    value:
      firstString(record, ['role', 'type']) === 'AXHeading'
        ? undefined
        : (firstString(record, ['value', 'text']) ??
          (typeof record.value === 'number' && Number.isFinite(record.value)
            ? String(record.value)
            : undefined)),
    description: firstString(record, ['description']),
    frame: sanitizeFrame(record.frame ?? record.bounds),
    disabled: firstBoolean(record, ['disabled']) ?? firstBoolean(states ?? {}, ['disabled']),
    selected: firstBoolean(record, ['selected']) ?? firstBoolean(states ?? {}, ['selected']),
  });
}

export function sanitizeFrame(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const output: Record<string, number> = {};
  for (const [from, to] of [
    ['x', 'x'],
    ['y', 'y'],
    ['w', 'width'],
    ['h', 'height'],
    ['width', 'width'],
    ['height', 'height'],
  ] as const) {
    const number = record[from];
    if (typeof number === 'number' && Number.isFinite(number)) output[to] = number;
  }
  return Object.keys(output).length ? output : undefined;
}

export function isHiddenWindowStructure(record: Record<string, unknown>): boolean {
  const role = firstString(record, ['role', 'type']);
  if (!/^(?:AXMenu(?:Bar|BarItem|Item)?|AXRuler(?:Marker)?)$/.test(role ?? '')) return false;
  const frame = sanitizeFrame(record.frame ?? record.bounds);
  return !frame || frame.width === 0 || frame.height === 0;
}

export function isProtectedElement(record: Record<string, unknown>): boolean {
  const identity = [
    firstString(record, ['role', 'type', 'input_type', 'inputType']),
    firstString(record, ['autocomplete']),
  ]
    .filter(isDefined)
    .join(' ');
  return /(?:password|secure|credential|one-time-code|current-password|new-password)/i.test(
    identity,
  );
}

export function windowHasProtectedControls(value: unknown): boolean {
  return ['elements', 'nodes']
    .flatMap((key) => findRecordArray(value, key))
    .filter((record) => !isHiddenWindowStructure(record))
    .some(
      (record) =>
        isProtectedElement(record) ||
        // Match authentication words, not "signing"/"blogging" in public page labels.
        /(?:secure|password|\b(?:sign(?:ing)?|log(?:ging)?).?in\b|authenticat|verification code|passkey|api.?key|access.?token)/i.test(
          [record.role, record.subrole, record.title, record.label]
            .filter((item) => typeof item === 'string')
            .join(' '),
        ),
    );
}

export function positiveInteger(value: unknown, maximum: number): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : undefined;
}

export function nonNegativeInteger(value: unknown): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

export function computerAppIdentity(
  name: string | undefined,
  bundleId: string | undefined,
): string | undefined {
  const bundle = bundleId?.trim().toLowerCase();
  if (bundle) return `bundle:${bundle}`;
  const label = name?.trim().toLowerCase();
  return label ? `name:${label}` : undefined;
}

export function trustedDisplayText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, 160) : undefined;
}

export function trustedElementLabel(record: Record<string, unknown>): string | undefined {
  const label = trustedDisplayText(
    firstString(record, ['label', 'name', 'aria_label', 'ariaLabel']),
  );
  if (!label) return undefined;
  const value = trustedDisplayText(firstString(record, ['value', 'text']));
  const role = firstString(record, ['role', 'type']);
  if (value === label || (/^AX(?:TextArea|TextField)$/.test(role ?? '') && label.length > 80)) {
    return undefined;
  }
  return label;
}

export function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
