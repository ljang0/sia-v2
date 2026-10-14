// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { canAnimate, dismissMotion, summon } from './floatingMotion';

function element(reduced = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced })),
  );
  const node = document.createElement('div');
  node.style.setProperty('--motion-exit', '120ms');
  node.style.setProperty('--motion-emphasis', '0.38s');
  node.style.setProperty('--motion-stagger', '28ms');
  node.style.setProperty('--ease-exit', 'ease-in');
  const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
  Object.assign(node, { animate });
  document.body.append(node);
  return { node, animate };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('reads exit timing from the motion tokens and stays quicker than the arrival', () => {
  const { node, animate } = element();
  expect(dismissMotion(node)).toBeDefined();
  expect(animate).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ duration: 120, easing: 'ease-in' }),
  );
  summon([node]);
  expect(animate).toHaveBeenLastCalledWith(
    expect.any(Array),
    expect.objectContaining({ duration: 380, delay: 0 }),
  );
});

it('staggers summoned parts and caps the stagger at eight', () => {
  const parts = Array.from({ length: 10 }, () => element());
  summon(parts.map(({ node }) => node));
  expect(parts[2]!.animate).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ delay: 56 }),
  );
  expect(parts[9]!.animate).not.toHaveBeenCalled();
});

it('does nothing under Reduced Motion, with Scotty motion off, or without Web Animations', () => {
  const { node, animate } = element(true);
  expect(dismissMotion(node)).toBeUndefined();
  summon([node]);
  expect(animate).not.toHaveBeenCalled();
  expect(canAnimate(element().node, false)).toBe(false);
  expect(canAnimate(document.createElement('div'))).toBe(false);
});
