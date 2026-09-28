import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import type { createMetalField } from './liquid-metal-field';
import './liquid-metal-button.css';
import { useAppearance } from './appearance';

type Props = ComponentPropsWithoutRef<'button'> & {
  label?: string;
  viewMode?: 'text' | 'icon';
  tone?: 'neutral' | 'sage' | 'danger';
  size?: 'regular' | 'compact';
};

/** Joly UI's reflective rim and press ripple, adapted to a native, accessible Sia button. */
export function LiquidMetalButton({
  label = 'Get started',
  viewMode = 'text',
  tone = 'neutral',
  size = 'regular',
  children,
  className = '',
  type = 'button',
  disabled,
  onClick,
  ...props
}: Props) {
  const calm = useAppearance() === 'calm';
  const surface = useRef<HTMLSpanElement>(null);
  const speed = useRef(0.35);
  const rippleId = useRef(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number }>();
  // Disabling pauses the field instead of disposing it, so toggling a send button does not
  // recreate a WebGL context and recompile the shader.
  const disabledRef = useRef(disabled);
  const syncRef = useRef<() => void>(undefined);
  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled) setRipple(undefined);
    syncRef.current?.();
  }, [disabled]);
  useEffect(() => {
    const host = surface.current!;
    if (calm) {
      setRipple(undefined);
      return;
    }
    if (typeof matchMedia !== 'function' || typeof IntersectionObserver === 'undefined') return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let field: Awaited<ReturnType<typeof createMetalField>> | undefined;
    let disposed = false;
    let loading = false;
    let failed = false;
    let visible = true;
    let frame = 0;
    let last = 0;
    let time = 1200;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };
    const canAnimate = () =>
      !disposed && !disabledRef.current && !motion.matches && !document.hidden && visible;
    const tick = (now: number) => {
      if (!field || !canAnimate()) return;
      if (!last || now - last >= 1000 / 30) {
        time += last ? Math.min(now - last, 100) * speed.current : 0;
        last = now;
        field.render(time);
      }
      frame = requestAnimationFrame(tick);
    };
    const onLoss = () => {
      stop();
      failed = true;
      field?.canvas.removeEventListener('webglcontextlost', onLoss);
      field?.dispose();
      field = undefined;
      host.dataset.metal = 'fallback';
    };
    const sync = () => {
      stop();
      if (motion.matches) setRipple(undefined);
      if (!canAnimate() || failed) return;
      if (field) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (loading) return;
      loading = true;
      void import('./liquid-metal-field')
        .then(async ({ createMetalField }) => {
          if (!canAnimate()) return;
          const next = await createMetalField(host);
          if (disposed) {
            next.dispose();
            return;
          }
          field = next;
          field.canvas.addEventListener('webglcontextlost', onLoss);
          host.dataset.metal = 'ready';
        })
        .catch(() => {
          if (disposed) return;
          failed = true;
          host.replaceChildren();
          host.dataset.metal = 'fallback';
        })
        .finally(() => {
          loading = false;
          if (!disposed && !failed && field) sync();
        });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      sync();
    });
    observer.observe(host);
    syncRef.current = sync;
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      disposed = true;
      syncRef.current = undefined;
      stop();
      observer.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      field?.canvas.removeEventListener('webglcontextlost', onLoss);
      field?.dispose();
      delete host.dataset.metal;
    };
  }, [calm]);

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`liquid-metal-button ${className}`}
      data-tone={tone}
      data-view={viewMode}
      data-size={size}
      aria-label={props['aria-label'] ?? (viewMode === 'icon' ? label : undefined)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') speed.current = 0.8;
        props.onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        speed.current = 0.35;
        props.onPointerLeave?.(event);
      }}
      onClick={(event) => {
        if (
          !calm &&
          typeof matchMedia === 'function' &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
          const rect = event.currentTarget.getBoundingClientRect();
          setRipple({
            x: event.detail ? event.clientX - rect.left : rect.width / 2,
            y: event.detail ? event.clientY - rect.top : rect.height / 2,
            id: ++rippleId.current,
          });
        }
        onClick?.(event);
      }}
    >
      <span className="metal-surface" ref={surface} aria-hidden="true" />
      <span className="metal-content">
        {children ?? (viewMode === 'icon' ? <Sparkle size={20} /> : label)}
      </span>
      {ripple && !disabled && (
        <span
          className="metal-ripple"
          key={ripple.id}
          aria-hidden="true"
          style={{ left: ripple.x, top: ripple.y }}
          onAnimationEnd={() => setRipple(undefined)}
        />
      )}
    </button>
  );
}
