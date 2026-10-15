import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Glide one selection highlight between the tabs of `nav` instead of swapping each tab's own
 * background. The highlight is an element covering the nav's scroll area, clipped to the active
 * tab with `clip-path` (set as `--indicator-clip`), so moving it animates only clip-path. The nav
 * gets `data-indicator` once the highlight is measured; until then (or without layout, as in
 * tests) the active tab keeps its own background. `key` changes whenever the active tab may have.
 */
export function useNavIndicator(
  nav: RefObject<HTMLElement | null>,
  key: string,
): RefObject<HTMLSpanElement | null> {
  const indicator = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = nav.current;
    const highlight = indicator.current;
    if (!container || !highlight) return undefined;
    const place = () => {
      const active = container.querySelector<HTMLElement>('[data-nav-active]');
      if (!active || active.offsetWidth === 0) {
        delete container.dataset.indicator;
        return;
      }
      const width = container.scrollWidth;
      const height = container.scrollHeight;
      highlight.style.width = `${width}px`;
      highlight.style.height = `${height}px`;
      const top = active.offsetTop;
      const left = active.offsetLeft;
      const right = width - left - active.offsetWidth;
      const bottom = height - top - active.offsetHeight;
      highlight.style.setProperty(
        '--indicator-clip',
        `inset(${top}px ${right}px ${bottom}px ${left}px round var(--radius-control))`,
      );
      // The first placement lands without travel; later ones glide.
      if (!container.dataset.indicator) {
        container.dataset.indicator = 'placing';
        requestAnimationFrame(() => {
          if (container.dataset.indicator) container.dataset.indicator = 'ready';
        });
      }
    };
    place();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [nav, key]);

  return indicator;
}
