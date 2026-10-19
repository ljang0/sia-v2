import { expect, it } from 'vitest';
import { sameWindowFrame, windowFrame, windowPixelBounds } from './window-pixels.js';

it('maps real Mac AX w/h frames to downsampled screenshot pixels without a Retina assumption', () => {
  const window = { x: 0, y: 34, width: 841, height: 981 };
  const bounds = windowPixelBounds({ x: 120, y: 323, w: 157, h: 22 }, window, {
    width: 1344,
    height: 1568,
  })!;
  expect(bounds.center_x).toBeCloseTo(317.2, 1);
  expect(bounds.center_y).toBeCloseTo(479.5, 1);
  expect(bounds.width).toBeCloseTo(250.9, 1);
  expect(bounds.height).toBeCloseTo(35.2, 1);
});

it('handles negative display origins and refuses hidden, clipped and invalid frames', () => {
  const window = { x: -800, y: -400, width: 800, height: 600 };
  expect(
    windowPixelBounds({ x: -700, y: -300, width: 200, height: 40 }, window, {
      width: 1600,
      height: 1200,
    }),
  ).toEqual({ x: 200, y: 200, width: 400, height: 80, center_x: 400, center_y: 240 });
  for (const frame of [
    { x: -801, y: -300, w: 40, h: 30 },
    { x: -10, y: -300, w: 40, h: 30 },
    { x: -700, y: -300, w: 0, h: 30 },
    { x: NaN, y: -300, w: 40, h: 30 },
  ])
    expect(windowPixelBounds(frame, window, { width: 1600, height: 1200 })).toBeUndefined();
  expect(windowPixelBounds({}, undefined, undefined)).toBeUndefined();
  expect(windowFrame({ x: 1, y: 2, w: Infinity, h: 5 })).toBeUndefined();
});

it('requires a stable observed window frame across capture', () => {
  const frame = { x: 10, y: 20, width: 800, height: 600 };
  expect(sameWindowFrame(frame, { ...frame })).toBe(true);
  expect(sameWindowFrame(frame, { ...frame, x: 11 })).toBe(false);
  expect(sameWindowFrame(frame, { ...frame, width: 900 })).toBe(false);
  expect(sameWindowFrame(frame, undefined)).toBe(false);
});
