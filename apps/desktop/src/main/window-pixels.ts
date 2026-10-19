export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** CUA's Mac AX frames use screen points and w/h; PNGs can have a different scale. */
export function windowFrame(value: unknown): WindowFrame | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const { x, y } = v;
  const width = v.width ?? v.w,
    height = v.height ?? v.h;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n)))
    return undefined;
  if ((width as number) <= 0 || (height as number) <= 0) return undefined;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

export function sameWindowFrame(
  a: WindowFrame | undefined,
  b: WindowFrame | undefined,
): boolean {
  return Boolean(
    a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height,
  );
}

export function windowPixelBounds(
  value: unknown,
  window: WindowFrame | undefined,
  pixels: { width: number; height: number } | undefined,
): Record<string, number> | undefined {
  const frame = windowFrame(value);
  if (!frame || !window || !pixels) return undefined;
  if (![pixels.width, pixels.height].every((n) => Number.isFinite(n) && n > 0))
    return undefined;
  const x = frame.x - window.x,
    y = frame.y - window.y;
  // Hidden, clipped and out-of-window controls must not acquire a pixel target.
  if (x < 0 || y < 0 || x + frame.width > window.width || y + frame.height > window.height)
    return undefined;
  const sx = pixels.width / window.width,
    sy = pixels.height / window.height;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    x: round(x * sx),
    y: round(y * sy),
    width: round(frame.width * sx),
    height: round(frame.height * sy),
    center_x: round((x + frame.width / 2) * sx),
    center_y: round((y + frame.height / 2) * sy),
  };
}
