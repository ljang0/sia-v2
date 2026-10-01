import { type RefObject, useLayoutEffect, useState } from 'react';

/** Whether a scroll container has content hidden above or below its fold. */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): {
  moreAbove: boolean;
  moreBelow: boolean;
} {
  const [moreAbove, setMoreAbove] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => {
      setMoreAbove(element.scrollTop > 1);
      setMoreBelow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref]);
  return { moreAbove, moreBelow };
}
