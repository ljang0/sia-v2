import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './motion-list.module.css';

// How long a new row keeps its entrance: longer than the CSS arrival and its hue glow
// (three --motion-emphasis), so a re-render never cuts the glow off mid-fade.
const ENTER_MS = 1200;
// The leaving row stays mounted at least as long as its CSS exit (--motion-exit).
const LEAVE_MS = 200;

interface Ghost<T> {
  item: T;
  index: number;
}

/**
 * A list whose rows open into place when added, fold away when removed, and glide when the order
 * changes. Rows present on first render do not animate. Reduced motion and the calm appearance
 * keep every change instant.
 */
export function MotionList<T extends { id: string }>({
  items,
  className,
  instant = false,
  children,
}: {
  items: readonly T[];
  className?: string | undefined;
  /** Apply changes without motion, e.g. while a search filters the list. */
  instant?: boolean;
  children(item: T): ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef(items);
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([]);
  // When each row first appeared; rows from the first render count as always present.
  const seen = useRef<Map<string, number> | null>(null);
  if (!seen.current) seen.current = new Map(items.map((item) => [item.id, -Infinity]));
  const now = performance.now();
  for (const item of items)
    if (!seen.current.has(item.id)) seen.current.set(item.id, instant ? -Infinity : now);
  const animate = useRef(!instant);
  animate.current = !instant;

  useLayoutEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    const removed = previous.current.flatMap((item, index) =>
      ids.has(item.id) || !animate.current || !still(list.current) ? [] : [{ item, index }],
    );
    const order = previous.current.map((item) => item.id);
    previous.current = items;
    if (removed.length) {
      for (const { item } of removed) seen.current?.delete(item.id);
      setGhosts((current) => [
        ...current.filter(
          (ghost) =>
            !ids.has(ghost.item.id) && !removed.some(({ item }) => item.id === ghost.item.id),
        ),
        ...removed,
      ]);
    } else {
      setGhosts((current) =>
        current.some((ghost) => ids.has(ghost.item.id))
          ? current.filter((ghost) => !ids.has(ghost.item.id))
          : current,
      );
    }
    if (animate.current) glide(list.current, order, items);
  }, [items]);

  useEffect(() => {
    if (!ghosts.length) return undefined;
    const timer = window.setTimeout(() => setGhosts([]), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [ghosts]);

  const rows: { item: T; leaving: boolean }[] = items.map((item) => ({ item, leaving: false }));
  for (const ghost of ghosts.toSorted((a, b) => a.index - b.index))
    rows.splice(Math.min(ghost.index, rows.length), 0, { item: ghost.item, leaving: true });

  return (
    <div ref={list} className={className}>
      {rows.map(({ item, leaving }) => {
        const entering = !leaving && now - (seen.current?.get(item.id) ?? -Infinity) < ENTER_MS;
        return (
          <div
            key={leaving ? `leaving:${item.id}` : item.id}
            className={styles.item}
            data-motion-id={leaving ? undefined : item.id}
            data-motion={leaving ? 'leave' : entering ? 'enter' : undefined}
            aria-hidden={leaving || undefined}
            inert={leaving || undefined}
          >
            <div className={styles.clip}>{children(item)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Whether motion is welcome here: not reduced by the system or the calm appearance. */
function still(element: HTMLElement | null): boolean {
  if (!element) return false;
  if (element.closest('[data-appearance="calm"]')) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Slide rows from where the old order put them to where they are now. */
function glide<T extends { id: string }>(
  list: HTMLDivElement | null,
  order: readonly string[],
  items: readonly T[],
) {
  if (!list || !still(list)) return;
  const next = items.map((item) => item.id);
  const kept = next.filter((id) => order.includes(id));
  const before = order.filter((id) => next.includes(id));
  if (kept.join('\n') === before.join('\n')) return;
  const rows = new Map<string, HTMLElement>();
  for (const row of list.querySelectorAll<HTMLElement>(':scope > [data-motion-id]'))
    rows.set(row.dataset.motionId!, row);
  const style = getComputedStyle(list);
  const gap = Number.parseFloat(style.rowGap) || 0;
  // Reordering glides on the shared surface timing with the soft spring from tokens.css.
  const motion = {
    duration: Number.parseFloat(style.getPropertyValue('--motion-surface')) || 240,
    easing: style.getPropertyValue('--ease-spring').trim() || 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  };
  const height = (id: string) => (rows.get(id)?.offsetHeight ?? 0) + gap;
  const oldTop = new Map<string, number>();
  let top = 0;
  for (const id of before) {
    oldTop.set(id, top);
    top += height(id);
  }
  let newTop = 0;
  for (const id of next) {
    const row = rows.get(id);
    const from = oldTop.get(id);
    if (row && from !== undefined && from !== newTop && typeof row.animate === 'function') {
      row.animate([{ transform: `translateY(${from - newTop}px)` }, { transform: 'none' }], {
        duration: motion.duration,
        easing: motion.easing,
      });
    }
    newTop += height(id);
  }
}
