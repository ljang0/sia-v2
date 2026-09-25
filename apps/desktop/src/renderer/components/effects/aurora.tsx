import { useEffect, useRef } from 'react';
import { createAuroraField } from './aurora-field';
import './aurora.css';

/** Decorative only: no pointer tracking or interference with the app's controls. */
export function Aurora({ className = '' }: { className?: string | undefined }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const root = rootRef.current!;
    const canvas = canvasRef.current!;
    if (typeof matchMedia !== 'function' || typeof ResizeObserver === 'undefined') {
      root.dataset.paused = 'true';
      return;
    }
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const appearance = matchMedia('(prefers-color-scheme: dark)');
    let field: ReturnType<typeof createAuroraField> | undefined;
    let frame = 0;
    let previous = 0;
    let elapsed = 18;
    let failed = false;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    };
    const tick = (now: number) => {
      if (!field || document.hidden || motion.matches) return;
      // Cap decoration at 30 fps, independent of display refresh rate.
      if (!previous || now - previous >= 1000 / 30) {
        elapsed += previous ? Math.min(now - previous, 100) / 1000 : 0;
        previous = now;
        field.render(elapsed);
      }
      frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (!field) return;
      field.resize(root.clientWidth, root.clientHeight);
      if (!document.hidden) field.render(elapsed);
    };
    const sync = () => {
      stop();
      root.dataset.paused = String(document.hidden || motion.matches);
      if (motion.matches) {
        field?.dispose();
        field = undefined;
        root.dataset.renderer = 'still';
        return;
      }
      if (failed) {
        root.dataset.renderer = 'fallback';
        return;
      }
      if (document.hidden) return;
      if (!field) {
        try {
          field = createAuroraField(canvas);
          field.theme(getComputedStyle(root));
          resize();
          root.dataset.renderer = 'waves';
        } catch {
          field?.dispose();
          field = undefined;
          failed = true;
          root.dataset.renderer = 'fallback';
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const onTheme = () => {
      field?.theme(getComputedStyle(root));
      if (!document.hidden) field?.render(elapsed);
    };
    const onLoss = () => {
      stop();
      field?.dispose();
      field = undefined;
      failed = true;
      root.dataset.renderer = 'fallback';
    };
    const onVisibility = () => sync();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    canvas.addEventListener('webglcontextlost', onLoss);
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', sync);
    appearance.addEventListener('change', onTheme);
    sync();
    return () => {
      stop();
      observer.disconnect();
      field?.dispose();
      canvas.removeEventListener('webglcontextlost', onLoss);
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', sync);
      appearance.removeEventListener('change', onTheme);
    };
  }, []);
  return (
    <div className={`sia-aurora ${className}`} aria-hidden="true" ref={rootRef}>
      <div className="aurora-fallback">
        <div className="aurora-veil aurora-emerald" />
        <div className="aurora-veil aurora-cyan" />
        <div className="aurora-veil aurora-violet" />
      </div>
      <canvas className="aurora-waves" ref={canvasRef} />
      <div className="aurora-horizon" />
    </div>
  );
}
