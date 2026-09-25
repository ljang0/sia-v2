import { useEffect, useRef } from 'react';
import { createAuroraField } from './aurora-field';
import './aurora.css';
import { useAppearance } from './appearance';

/** Decorative only: no pointer tracking or interference with the app's controls. */
export function Aurora({ className = '' }: { className?: string | undefined }) {
  const calm = useAppearance() === 'calm';
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
    let contextLost = false;
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
      root.dataset.paused = String(document.hidden || motion.matches || calm);
      if (motion.matches || calm) {
        field?.dispose();
        field = undefined;
        root.dataset.renderer = 'still';
        return;
      }
      if (failed || contextLost) {
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
    const onLoss = (event: Event) => {
      // Allow Safari to restore a context evicted while the phone was backgrounded.
      event.preventDefault();
      contextLost = true;
      stop();
      field?.dispose();
      field = undefined;
      failed = true;
      root.dataset.renderer = 'fallback';
    };
    const onRestore = () => {
      contextLost = false;
      failed = false;
      sync();
    };
    const onResume = () => {
      if (!document.hidden) failed = false;
      sync();
      if (!document.hidden) resize();
    };
    const onPageHide = () => {
      stop();
      root.dataset.paused = 'true';
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    canvas.addEventListener('webglcontextlost', onLoss);
    canvas.addEventListener('webglcontextrestored', onRestore);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('pagehide', onPageHide);
    motion.addEventListener('change', sync);
    appearance.addEventListener('change', onTheme);
    sync();
    return () => {
      stop();
      observer.disconnect();
      field?.dispose();
      canvas.removeEventListener('webglcontextlost', onLoss);
      canvas.removeEventListener('webglcontextrestored', onRestore);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('pagehide', onPageHide);
      motion.removeEventListener('change', sync);
      appearance.removeEventListener('change', onTheme);
    };
  }, [calm]);
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
