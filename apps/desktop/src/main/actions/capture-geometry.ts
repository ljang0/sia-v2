import { asRecord } from './driver-records.js';

type Rect = { x: number; y: number; width: number; height: number };
export interface CaptureGeometry {
  surface: {
    window_id: number;
    pid: number;
    parent: Rect;
    sheet: { window_id: number; bounds: Rect } | null;
    popup?: { window_id: number; pid: number; bounds: Rect };
  };
  content: Rect;
  pixels_per_point: number;
  width: number;
  height: number;
}
function rect(value: unknown): Rect | undefined {
  const r = asRecord(value);
  if (
    !r ||
    !['x', 'y', 'width', 'height'].every(
      (k) => typeof r[k] === 'number' && Number.isFinite(r[k]),
    )
  )
    return;
  const { x, y, width, height } = r as Rect;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Only geometry supplied by the native capture boundary; never content or model arguments. */
export function captureGeometry(value: unknown): CaptureGeometry | undefined {
  const result = asRecord(value);
  const g = asRecord(
    result?.capture_geometry ?? asRecord(result?.structuredContent)?.capture_geometry,
  );
  const s = asRecord(g?.surface);
  const parent = rect(s?.parent),
    content = rect(g?.content);
  if (
    !g ||
    !s ||
    !parent ||
    !content ||
    !positive(s.window_id) ||
    !positive(s.pid) ||
    !positive(g.width) ||
    !positive(g.height) ||
    typeof g.pixels_per_point !== 'number' ||
    !Number.isFinite(g.pixels_per_point) ||
    g.pixels_per_point <= 0 ||
    g.pixels_per_point > 2.01
  )
    return;
  let sheet: CaptureGeometry['surface']['sheet'] = null;
  if (s.sheet !== null) {
    const raw = asRecord(s.sheet),
      bounds = rect(raw?.bounds);
    if (!raw || !bounds || !positive(raw.window_id)) return;
    sheet = { window_id: raw.window_id, bounds };
  }
  let popup: CaptureGeometry['surface']['popup'];
  if (s.popup != null) {
    const raw = asRecord(s.popup),
      bounds = rect(raw?.bounds);
    if (!raw || !bounds || !positive(raw.window_id) || !positive(raw.pid)) return;
    popup = { window_id: raw.window_id, pid: raw.pid, bounds };
  }
  return {
    surface: { window_id: s.window_id, pid: s.pid, parent, sheet, ...(popup && { popup }) },
    content,
    pixels_per_point: g.pixels_per_point,
    width: g.width,
    height: g.height,
  };
}

export function sameCaptureGeometry(a: CaptureGeometry, b: CaptureGeometry): boolean {
  return (
    JSON.stringify(a.surface) === JSON.stringify(b.surface) &&
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.pixels_per_point - b.pixels_per_point) < 0.000001 &&
    (['x', 'y', 'width', 'height'] as const).every(
      (key) => Math.abs(a.content[key] - b.content[key]) < 0.5,
    )
  );
}
