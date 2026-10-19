import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { useAppearance } from './appearance';
import './gradient-text.css';

/** React Bits GradientText's linear palette, with CSS motion and visibility-aware pausing. */
export function GradientText({
  as: Tag = 'span',
  className = '',
  children,
  speed = 18,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'span' | 'h1' | 'h2'; speed?: number }) {
  const root = useRef<HTMLElement>(null);
  const appearance = useAppearance();
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let visible = true;
    const sync = () => {
      element.style.animationPlayState = document.hidden || !visible ? 'paused' : 'running';
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = Boolean(entry?.isIntersecting);
            sync();
          });
    observer?.observe(element);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [Tag]);
  return (
    <Tag
      {...props}
      ref={(element) => {
        root.current = element;
      }}
      data-gradient-text
      data-appearance={appearance}
      className={`sia-gradient-text ${className}`}
      style={
        {
          '--gradient-speed': `${Math.min(60, Math.max(6, speed))}s`,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
