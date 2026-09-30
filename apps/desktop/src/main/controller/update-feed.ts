/** Checks for the signed release feed. */

export function isCleanHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol === 'https:' && !url.username && !url.password && !url.hash);
  } catch {
    return false;
  }
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const [core = '', prerelease] = value.replace(/^v/, '').split('-', 2);
    return {
      core: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prerelease?.split('.'),
    };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);
  const leftParts = leftVersion.core;
  const rightParts = rightVersion.core;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  for (
    let index = 0;
    index < Math.max(leftVersion.prerelease?.length ?? 0, rightVersion.prerelease?.length ?? 0);
    index += 1
  ) {
    const leftPart = leftVersion.prerelease?.[index];
    const rightPart = rightVersion.prerelease?.[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}
