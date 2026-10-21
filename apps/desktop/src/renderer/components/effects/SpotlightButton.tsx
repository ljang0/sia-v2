import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useAppearance } from './appearance';
import './spotlight-button.css';

/** React Bits SpotlightCard's pointer/focus light, adapted to a native Sia button.
 * No global pointer listeners or continuous animation loop. See THIRD_PARTY_NOTICES.md. */
export function SpotlightButton({
  children,
  className = '',
  onPointerMove,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  const root = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const calm = useAppearance() === 'calm';
  const reduced = useRef(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduced.current = motion.matches;
      if (motion.matches) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        root.current?.style.removeProperty('--spotlight-x');
        root.current?.style.removeProperty('--spotlight-y');
      }
    };
    sync();
    motion.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  return (
    <button
      {...props}
      ref={root}
      type={props.type ?? 'button'}
      className={`sia-spotlight ${className}`}
      data-calm={calm}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (
          calm ||
          reduced.current ||
          event.pointerType !== 'mouse' ||
          document.hidden ||
          frame.current
        )
          return;
        const { clientX, clientY } = event;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          const button = root.current;
          if (!button || document.hidden || reduced.current) return;
          const rect = button.getBoundingClientRect();
          button.style.setProperty('--spotlight-x', `${clientX - rect.left}px`);
          button.style.setProperty('--spotlight-y', `${clientY - rect.top}px`);
        });
      }}
      onPointerLeave={(event) => {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        root.current?.style.removeProperty('--spotlight-x');
        root.current?.style.removeProperty('--spotlight-y');
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        root.current?.style.removeProperty('--spotlight-x');
        root.current?.style.removeProperty('--spotlight-y');
        onFocus?.(event);
      }}
      onBlur={onBlur}
    >
      {children}
    </button>
  );
}
