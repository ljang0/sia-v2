import { useEffect } from 'react';

/** Follow the visible screen, including Safari's keyboard-driven viewport pan. */
export function usePhoneViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let width = window.innerWidth;
    let fullHeight = window.innerHeight;
    let keyboardOpen = false;
    const update = () => {
      frame = 0;
      // Preserve normal browser pinch-to-zoom; it must not be mistaken for a keyboard.
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const height = viewport?.height ?? window.innerHeight;
      const top = Math.max(0, viewport?.offsetTop ?? 0);
      const editing = document.activeElement?.matches(
        'textarea, input, [contenteditable="true"]',
      );
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      if (!editing && !keyboardOpen) fullHeight = window.innerHeight;
      const obscured = Math.max(fullHeight, window.innerHeight) - height > 120;
      keyboardOpen = obscured && (!!editing || keyboardOpen);
      root.style.setProperty('--phone-height', `${height}px`);
      root.style.setProperty('--phone-top', `${top}px`);
      root.style.setProperty(
        '--phone-bottom',
        `${Math.max(0, window.innerHeight - height - top)}px`,
      );
      root.dataset.phoneKeyboard = keyboardOpen ? 'open' : 'closed';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      for (const name of ['--phone-height', '--phone-top', '--phone-bottom'])
        root.style.removeProperty(name);
      delete root.dataset.phoneKeyboard;
    };
  }, []);
}
