import { useLayoutEffect } from 'react';
import { TEXT_SCALE, type TextSize } from '../shared/display';

/**
 * Scales every type token in this window (tokens.css multiplies them by --text-scale). Each
 * surface — the main window, Scotty, and the ⌘E launcher — applies the saved size itself.
 */
export function applyTextSize(size: TextSize | undefined, root = document.documentElement) {
  const next = size && size in TEXT_SCALE ? size : 'default';
  root.dataset.textSize = next;
  root.style.setProperty('--text-scale', String(TEXT_SCALE[next]));
}

export function useTextSize(size: TextSize | undefined) {
  useLayoutEffect(() => applyTextSize(size), [size]);
}
