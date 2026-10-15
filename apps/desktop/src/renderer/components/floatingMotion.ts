/**
 * Summon and dismiss motion for Sia's always-on floating windows (Scotty's tray, the ⌘E launcher).
 * Those windows are shown and hidden by the main process rather than remounted, so CSS entry
 * animations would play only once; these helpers replay a short Web Animation instead. Durations,
 * travel, scale, and easing are read from the motion tokens on the element, so Reduced Motion and
 * Calm keep working, and nothing here ever blocks input.
 */
function token(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}

export function canAnimate(element: Element | null | undefined, enabled = true): boolean {
  return Boolean(
    enabled &&
    element &&
    typeof (element as HTMLElement).animate === 'function' &&
    typeof matchMedia === 'function' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
}

/** Arrival: the given parts rise into place on the spring, staggered and capped at eight. */
export function summon(parts: Element[], enabled = true): void {
  parts.slice(0, 8).forEach((part, index) => {
    if (!canAnimate(part, enabled)) return;
    const rise = token(part, '--motion-rise') || '0px';
    const scale = token(part, '--motion-pop-scale') || '1';
    part.animate(
      [
        { opacity: 0, transform: `translateY(${rise}) scale(${scale})` },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: milliseconds(token(part, '--motion-emphasis')),
        delay: index * milliseconds(token(part, '--motion-stagger')),
        easing: token(part, '--ease-spring') || 'ease-out',
        fill: 'backwards',
      },
    );
  });
}

/**
 * Exit: a quicker fade that lifts away. Resolves when the surface can be hidden; the returned
 * animation lets the caller cancel it (for example when the window loses focus meanwhile).
 */
export function dismissMotion(
  element: Element | null | undefined,
  enabled = true,
): Animation | undefined {
  if (!canAnimate(element, enabled)) return undefined;
  const target = element as HTMLElement;
  const rise = token(target, '--motion-nudge') || '0px';
  const scale = token(target, '--motion-pop-scale') || '1';
  return target.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translateY(calc(-1 * ${rise})) scale(${scale})` },
    ],
    {
      duration: milliseconds(token(target, '--motion-exit')),
      easing: token(target, '--ease-exit') || 'ease-in',
      fill: 'forwards',
    },
  );
}
