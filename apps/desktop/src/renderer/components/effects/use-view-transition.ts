import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Animate the existing surface; never remount the composer or delay navigation.
 *
 * Views are named `kind:detail`. Moving within a kind (another thread, another settings
 * section) animates only the body. Moving between kinds (a conversation and Settings or
 * Activity) animates `page`, the body together with its header, so leaving a full page moves
 * the same way entering it did.
 */
export function useViewTransition(
  surface: RefObject<HTMLElement | null>,
  view: string,
  calm = false,
  page?: RefObject<HTMLElement | null>,
) {
  const previous = useRef(view);
  useLayoutEffect(() => {
    const before = previous.current;
    const changed = before !== view;
    previous.current = view;
    const betweenPages = viewKind(before) !== viewKind(view);
    const node = (betweenPages ? page?.current : undefined) ?? surface.current;
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
  }, [surface, page, view, calm]);
}

function viewKind(view: string): string {
  return view.split(':', 1)[0] ?? view;
}

/**
 * Switch light and dark in one frame. Without this, every control with a color transition
 * eases to the new theme on its own schedule and the window changes in a visible stagger.
 */
export function useInstantThemeSwitch() {
  useEffect(() => {
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!scheme) return undefined;
    const root = document.documentElement;
    let frame = 0;
    const onChange = () => {
      root.dataset.themeSwitching = 'true';
      // Chromium may restyle for the new scheme before this event: end what already started.
      void getComputedStyle(root).color;
      for (const animation of document.getAnimations?.() ?? [])
        if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition)
          animation.finish();
      cancelAnimationFrame(frame);
      // Two frames: the new colors are applied without transitions before they come back.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          delete root.dataset.themeSwitching;
        });
      });
    };
    scheme.addEventListener('change', onChange);
    return () => {
      scheme.removeEventListener('change', onChange);
      cancelAnimationFrame(frame);
      delete root.dataset.themeSwitching;
    };
  }, []);
}
