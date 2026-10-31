/** Voice activation identifies an app; screenshots supply all UI content. */
export function visualActivationContext(value: unknown): string | undefined {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { app, bundleID } = value as Record<string, unknown>;
  if (
    typeof app !== 'string' ||
    typeof bundleID !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,200}$/.test(bundleID)
  )
    return undefined;
  const name = app
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 160);
  return name ? JSON.stringify({ app: name, bundleID }) : undefined;
}
