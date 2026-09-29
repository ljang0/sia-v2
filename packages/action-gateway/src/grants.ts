import { createHash } from 'node:crypto';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(',')}}`;
}

export function actionTargetDigest(toolName: string, argumentsValue: unknown): string {
  return createHash('sha256')
    .update(`${toolName}\0${canonicalize(argumentsValue)}`)
    .digest('hex');
}
