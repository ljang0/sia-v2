import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Animate the existing surface; never remount the composer or delay navigation. */
export function useViewTransition(
  surface: RefObject<HTMLElement | null>,
  view: string,
  calm = false,
) {
  const previous = useRef(view);
  useLayoutEffect(() => {
    const changed = previous.current !== view;
    previous.current = view;
    const node = surface.current;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!changed || !node?.animate || calm || motion?.matches) return;
    const animation = node.animate(
      [
        { opacity: 0.5, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    const cancel = () => animation.cancel();
    motion?.addEventListener('change', cancel);
    return () => {
      cancel();
      motion?.removeEventListener('change', cancel);
    };
  }, [surface, view, calm]);
}
