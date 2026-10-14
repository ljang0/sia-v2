import { useEffect, useRef, useState } from 'react';
import type { ScottyApi } from '../../shared/scotty';
import '../tokens.css';
import { ScottySprite } from './ScottySprite';
import styles from './Scotty.module.css';
import { labels, poses, useScotty } from './useScotty';

/** Scotty on the desktop: a draggable companion whose pose and badge say how Sia is doing. */
export function ScottyPet({ api = window.siaScotty }: { api?: ScottyApi }) {
  const { state, error, setError } = useScotty(api);
  const [dragging, setDragging] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const interacting = useRef(false);
  useEffect(() => {
    setSleeping(false);
    if (state.status !== 'idle') return;
    const timeout = setTimeout(() => setSleeping(true), 60000);
    return () => clearTimeout(timeout);
  }, [state.status]);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const interactive =
        event.target instanceof Element && Boolean(event.target.closest('[data-scotty-hit]'));
      if (interacting.current !== interactive) {
        interacting.current = interactive;
        api.interactive(interactive);
      }
    };
    const leave = () => {
      if (!pointer.current) {
        interacting.current = false;
        api.interactive(false);
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseleave', leave);
    };
  }, [api]);
  const run = (promise: Promise<unknown>) => {
    void promise.catch(() => setError('Open Sia to reconnect Scotty.'));
  };
  const finishDrag = (cancelled: boolean) => {
    const was = pointer.current;
    if (!was) return;
    pointer.current = undefined;
    setDragging(false);
    run(api.move('end'));
    if (!cancelled && !was.moved) run(api.expand(true));
  };
  const pose = dragging
    ? 'trot'
    : sleeping && state.status === 'idle'
      ? 'sleep'
      : poses[state.status];
  const count = state.attentionCount || state.workingCount;
  const size = { small: 112, medium: 144, large: 176 }[state.settings.size];
  return (
    <main className={styles.pet} data-status={state.status} data-motion={state.settings.motion}>
      <button
        className={styles.dog}
        data-scotty-hit
        aria-label="Scotty. Drag to move; click to open tasks."
        title="Drag Scotty to move · click for tasks"
        data-dragging={dragging}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { x: event.screenX, y: event.screenY, moved: false };
          setSleeping(false);
          run(api.move('start'));
        }}
        onPointerMove={(event) => {
          const current = pointer.current;
          if (!current) return;
          if (Math.hypot(event.screenX - current.x, event.screenY - current.y) > 4)
            current.moved = true;
          if (current.moved) {
            setDragging(true);
            run(api.move('update'));
          }
        }}
        onPointerUp={() => finishDrag(false)}
        onPointerCancel={() => finishDrag(true)}
        onLostPointerCapture={() => finishDrag(true)}
        onClick={(event) => {
          if (event.detail === 0) run(api.expand(true));
        }}
        onKeyDown={(event) => {
          const deltas: Record<string, [number, number]> = {
            ArrowLeft: [-20, 0],
            ArrowRight: [20, 0],
            ArrowUp: [0, -20],
            ArrowDown: [0, 20],
          };
          const delta = deltas[event.key];
          if (delta) {
            event.preventDefault();
            run(api.nudge(...delta));
          }
        }}
      >
        {/* Keyed by state so each change plays its own one-off beat (hop, perk, settle). */}
        <span key={state.status} className={styles.stage}>
          <ScottySprite pose={pose} size={size} motion={state.settings.motion} />
        </span>
      </button>
      <button
        data-scotty-hit
        className={styles.badge}
        onClick={() => run(api.expand(true))}
        aria-label="Open Scotty tasks"
      >
        <span key={error ? 'error' : state.status} className={styles.badgeLabel}>
          <span className={styles.dot} />
          {error ? 'Open Sia' : labels[state.status]}
        </span>
        {count > 0 && <b key={count}>{count}</b>}
      </button>
    </main>
  );
}
