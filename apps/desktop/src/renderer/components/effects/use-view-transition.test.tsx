// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { useRef, type CSSProperties } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInstantThemeSwitch, useViewTransition } from './use-view-transition';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ view }: { view: string }) {
  const page = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useViewTransition(body, view, false, page);
  return (
    <section ref={page} data-testid="page">
      <div ref={body} data-testid="body" />
    </section>
  );
}

function mediaList(matches = false) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    fire: () => listeners.forEach((listener) => listener()),
  };
}

describe('view transitions', () => {
  it('moves the header with the body when leaving or entering a full page', () => {
    vi.stubGlobal('matchMedia', () => mediaList());
    const animated: string[] = [];
    const animate = vi.fn(function (this: HTMLElement) {
      animated.push(this.dataset.testid ?? '');
      return { cancel: () => undefined } as unknown as Animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const view = render(<Harness view="thread:a" />);
    view.rerender(<Harness view="thread:b" />);
    view.rerender(<Harness view="settings:providers" />);
    view.rerender(<Harness view="settings:voice" />);
    view.rerender(<Harness view="thread:b" />);
    expect(animated).toEqual(['body', 'page', 'body', 'page']);
  });

  it('cross-fades the room hue when the agent changes, unless motion is reduced', async () => {
    let reduced = false;
    vi.stubGlobal('matchMedia', (query: string) =>
      mediaList(reduced && query.includes('reduce')),
    );
    const keyframes: Keyframe[][] = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: vi.fn((frames: Keyframe[]) => {
        keyframes.push(frames);
        return { cancel: () => undefined, playState: 'finished' } as unknown as Animation;
      }),
    });
    function Room({ hue }: { hue: string }) {
      const page = useRef<HTMLElement>(null);
      const body = useRef<HTMLDivElement>(null);
      useViewTransition(body, 'thread:a', false, page);
      return (
        <section
          ref={page}
          data-identity={hue}
          style={{ '--agent-color': hue } as CSSProperties}
        >
          <div ref={body} />
        </section>
      );
    }
    const view = render(<Room hue="red" />);
    view.rerender(<Room hue="blue" />);
    await Promise.resolve();
    expect(keyframes).toEqual([[{ '--agent-color': 'red' }, { '--agent-color': 'blue' }]]);

    reduced = true;
    view.rerender(<Room hue="green" />);
    await Promise.resolve();
    expect(keyframes).toHaveLength(1);
  });

  it('switches light and dark without per-control transitions', () => {
    const scheme = mediaList();
    vi.stubGlobal('matchMedia', () => scheme);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    function Theme() {
      useInstantThemeSwitch();
      return null;
    }
    render(<Theme />);
    scheme.fire();
    expect(document.documentElement.dataset.themeSwitching).toBe('true');
    frames.shift()?.(0);
    frames.shift()?.(0);
    expect(document.documentElement.dataset.themeSwitching).toBeUndefined();
  });
});
