import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppearance } from './appearance';
import './aurora.css';
import './dither-aurora.css';

const Dither = lazy(() => import('./dither-preview/Dither.jsx'));

class DitherBoundary extends Component<
  { children: ReactNode; onError(): void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

let webglSupport: boolean | undefined;

/** Probes once so machines without WebGL keep the CSS aurora instead of a failing renderer. */
function supportsWebGL() {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    webglSupport = Boolean(context);
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * React Bits Dither aurora shared by desktop and phone.
 *
 * `still` keeps the CSS veils without a WebGL renderer, for scenes where the aurora is too faint
 * to justify GPU work. `pauseWhenUnfocused` stops rendering while the window is in the background.
 */
export function DitherAurora({
  className = '',
  still = false,
  pauseWhenUnfocused = false,
}: {
  className?: string | undefined;
  still?: boolean;
  pauseWhenUnfocused?: boolean;
}) {
  const calm = useAppearance() === 'calm';
  const root = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [environment, setEnvironment] = useState({ dark: false, animate: false });
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const theme = matchMedia('(prefers-color-scheme: dark)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let pageHidden = false;
    let wasHidden = document.hidden;
    const sync = () =>
      setEnvironment({
        dark: theme.matches,
        animate:
          !motion.matches &&
          !document.hidden &&
          !pageHidden &&
          (!pauseWhenUnfocused || document.hasFocus()),
      });
    const onVisibility = () => {
      if (wasHidden && !document.hidden) setFailed(false);
      wasHidden = document.hidden;
      sync();
    };
    const onPageHide = () => {
      pageHidden = true;
      sync();
    };
    const onPageShow = () => {
      pageHidden = false;
      setFailed(false);
      sync();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    sync();
    theme.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    root.current?.addEventListener('webglcontextlost', onContextLost, true);
    if (pauseWhenUnfocused) {
      window.addEventListener('focus', sync);
      window.addEventListener('blur', sync);
    }
    const element = root.current;
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      theme.removeEventListener('change', sync);
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      element?.removeEventListener('webglcontextlost', onContextLost, true);
    };
  }, [pauseWhenUnfocused]);
  const active = environment.animate && !calm && !still;
  const animate = active && !failed && supportsWebGL();
  return (
    <div
      className={`sia-aurora dither-aurora ${className}`}
      aria-hidden="true"
      data-renderer={animate ? 'dither' : active ? 'fallback' : 'still'}
      data-paused={!active}
      ref={root}
    >
      <div className="aurora-fallback">
        <div className="aurora-veil aurora-emerald" />
        <div className="aurora-veil aurora-cyan" />
        <div className="aurora-veil aurora-violet" />
      </div>
      {animate && (
        <DitherBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div className="dither-aurora-field">
              <Dither
                waveSpeed={0.035}
                waveFrequency={2.4}
                waveAmplitude={0.38}
                waveColor={environment.dark ? [0.36, 0.62, 0.52] : [0.4, 0.68, 0.56]}
                backgroundColor={environment.dark ? [0.02, 0.04, 0.035] : [0.98, 0.98, 0.98]}
                colorNum={5}
                pixelSize={2}
                enableMouseInteraction={false}
              />
              <div className="dither-aurora-tint" />
            </div>
          </Suspense>
        </DitherBoundary>
      )}
      <div className="aurora-horizon" />
    </div>
  );
}
