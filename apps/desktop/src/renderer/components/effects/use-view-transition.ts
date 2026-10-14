import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Animate the existing surface; never remount the composer or delay navigation.
 *
 * Views are named `kind:detail`. Moving within a kind (another thread, another settings
 * section) animates only the body. Moving between kinds (a conversation and Settings or
 * Activity) animates `page`, the body together with its header, so leaving a full page moves
 * the same way entering it did. When `page` carries the room's identity (`data-identity`),
 * switching agents also cross-fades the room's hue, so the whole room changes identity
 * instead of snapping. Timings come from tokens.css, so Reduced Motion and Calm still apply.
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
    const rise = token(node, '--motion-rise', 8);
    // A new page arrives with a soft spring from slightly below and smaller; within a page the
    // body settles a shorter distance on the surface timing.
    const animation = node.animate(
      betweenPages
        ? [
            {
              opacity: 0.35,
              transform: `translateY(${rise}px) scale(${token(node, '--motion-pop-scale', 0.96) * 0.5 + 0.5})`,
            },
            { opacity: 1, transform: 'none' },
          ]
        : [
            { opacity: 0.5, transform: `translateY(${rise * 0.75}px)` },
            { opacity: 1, transform: 'none' },
          ],
      betweenPages
        ? {
            duration: token(node, '--motion-emphasis', 380),
            easing: easing(node, '--ease-spring', 'cubic-bezier(0.22, 1, 0.36, 1)'),
          }
        : {
            duration: token(node, '--motion-surface', 240),
            easing: easing(node, '--ease-out-soft', 'cubic-bezier(0.22, 1, 0.36, 1)'),
          },
    );
    const cancel = () => animation.cancel();
    motion?.addEventListener('change', cancel);
    return () => {
      cancel();
      motion?.removeEventListener('change', cancel);
    };
  }, [surface, page, view, calm]);
  useRoomIdentity(page);
}

/**
 * Cross-fade the room's `--agent-color` when its `data-identity` changes. The property is
 * registered as a colour so it interpolates and every hued surface inside the room follows.
 */
function useRoomIdentity(page: RefObject<HTMLElement | null> | undefined) {
  useLayoutEffect(() => {
    const node = page?.current;
    if (!node || typeof MutationObserver === 'undefined') return undefined;
    registerAgentColor();
    let color = agentColor(node);
    let fade: Animation | undefined;
    const observer = new MutationObserver(() => {
      const running = fade?.playState === 'running';
      // Mid-fade, start from the colour on screen rather than the last settled one.
      const from = running ? agentColor(node) : color;
      fade?.cancel();
      fade = undefined;
      color = agentColor(node);
      const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (!from || !color || from === color || !node.animate || motion?.matches) return;
      fade = node.animate([{ '--agent-color': from }, { '--agent-color': color }], {
        duration: token(node, '--motion-emphasis', 380),
        easing: easing(node, '--ease-standard', 'ease'),
      });
    });
    observer.observe(node, { attributes: true, attributeFilter: ['data-identity'] });
    return () => {
      observer.disconnect();
      fade?.cancel();
    };
  }, [page]);
}

let agentColorRegistered = false;
function registerAgentColor() {
  if (agentColorRegistered) return;
  agentColorRegistered = true;
  try {
    CSS.registerProperty?.({
      name: '--agent-color',
      syntax: '<color>',
      inherits: true,
      initialValue: '#638496',
    });
  } catch {
    // Already registered (hot reload) or unsupported: the hue simply switches without a fade.
  }
}

function agentColor(node: HTMLElement): string {
  return getComputedStyle(node).getPropertyValue('--agent-color').trim();
}

/** A numeric token in ms or px, read where it applies so Reduced Motion and Calm count. */
function token(node: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(node).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function easing(node: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(node).getPropertyValue(name).trim() || fallback;
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
