import { ArrowUp, ArrowUpRight, Plus, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { LauncherState } from '../../shared/launcher';
import styles from './CommandLauncher.module.css';
import { AppearanceContext } from './effects/appearance';
import { DitherAurora as Aurora } from './effects/DitherAurora';
import { LiquidMetalButton } from './effects/liquid-metal-button';
import { useTextSize } from '../textSize';
import { errorMessage } from '../plainErrors';
export function CommandLauncher() {
  const [state, setState] = useState<LauncherState>({ agents: [] });
  useTextSize(state.textSize);
  const [agentId, setAgentId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const opening = useRef(false);
  const handoff = useRef(0);
  const exitAnimation = useRef<Animation | undefined>(undefined);
  const field = useRef<HTMLTextAreaElement>(null);
  const session = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const receive = (next: LauncherState) => {
      if (!active) return;
      if (session.current !== next.task?.sessionId) {
        setText('');
        setError('');
        session.current = next.task?.sessionId;
      }
      setState(next);
      setAgentId(
        (current) =>
          next.task?.agentId ??
          (next.agents.some((a) => a.id === current)
            ? current
            : (next.agentId ?? next.agents[0]?.id ?? '')),
      );
    };
    const refresh = () => {
      void window.siaLauncher
        .state()
        .then((next) => {
          receive(next);
          if (active) field.current?.focus();
        })
        .catch(() => {
          if (active) setError('Open Sia to finish setting up.');
        });
    };
    const cancelHandoff = () => {
      handoff.current++;
      exitAnimation.current?.cancel();
    };
    window.addEventListener('blur', cancelHandoff);
    const unsubscribe = window.siaLauncher.onState(receive);
    refresh();
    field.current?.focus();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      cancelHandoff();
      window.removeEventListener('blur', cancelHandoff);
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const task = state.task;
  const working = task?.status === 'running' || task?.status === 'waiting';
  useEffect(() => {
    if (!busy && !working) field.current?.focus();
  }, [task?.sessionId, busy, working, state.agents.length]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not complete this action.'));
    } finally {
      setBusy(false);
    }
  }
  async function openConversation(sessionId?: string) {
    if (opening.current) return;
    opening.current = true;
    const ticket = ++handoff.current;
    await action(async () => {
      let animation: Animation | undefined;
      try {
        if (
          state.appearance !== 'calm' &&
          typeof matchMedia === 'function' &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches &&
          panel.current?.animate
        ) {
          animation = panel.current.animate(
            [
              { opacity: 1, transform: 'translateY(0) scale(1)' },
              { opacity: 0, transform: 'translateY(5px) scale(0.98)' },
            ],
            { duration: 160, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
          );
          exitAnimation.current = animation;
          await animation.finished.catch(() => undefined);
        }
        if (ticket !== handoff.current) return;
        await window.siaLauncher.openSia(sessionId);
      } finally {
        animation?.cancel();
        exitAnimation.current = undefined;
        opening.current = false;
      }
    });
  }
  function dismiss() {
    handoff.current++;
    exitAnimation.current?.cancel();
    void window.siaLauncher
      .dismiss()
      .catch(() => setError('Could not close the launcher. Try again.'));
  }
  async function send() {
    if (busy || working || !text.trim() || !agentId) return;
    await action(async () => {
      await window.siaLauncher.send(
        task
          ? { kind: 'reply', sessionId: task.sessionId, text }
          : { kind: 'new', agentId, text },
      );
      setText('');
    });
  }
  const content = (
    <main
      ref={panel}
      data-appearance={state.appearance ?? 'expressive'}
      className={styles.launcher}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss();
        }
      }}
    >
      <Aurora className={styles.aurora} />
      <header>
        <span className={styles.mark} aria-hidden="true" />
        <strong>Sia</strong>
        <kbd className={styles.hint}>⌘ E</kbd>
        <button aria-label="Close launcher" onClick={dismiss}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      {task && (
        <section className={styles.result} aria-label="Current request">
          <div className={styles.taskHeading}>
            <strong>{task.title}</strong>
            <button
              disabled={busy}
              aria-label="New request"
              title="New request"
              onClick={() => void action(() => window.siaLauncher.newRequest(task.sessionId))}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <p className={styles.progress} role="status" data-status={task.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            {task.progress}
          </p>
          {task.response && (
            <div className={styles.response}>
              {task.truncated && (
                <small>Showing the latest part. Open Sia for the full response.</small>
              )}
              {task.response}
            </div>
          )}
          <div className={styles.taskActions}>
            {working && (
              <button
                disabled={busy}
                onClick={() => void action(() => window.siaLauncher.cancel(task.sessionId))}
              >
                Stop
              </button>
            )}
            <button disabled={busy} onClick={() => void openConversation(task.sessionId)}>
              {task.status === 'waiting' ? 'Review in Sia' : 'Open conversation'}{' '}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
      {state.agents.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={field}
            autoFocus
            aria-label="Your request"
            placeholder={
              working
                ? 'Sia is working on your request…'
                : task
                  ? 'Ask a follow-up…'
                  : 'Ask anything, or give me a task…'
            }
            maxLength={4000}
            value={text}
            disabled={busy || working}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <footer>
            {state.agents.length === 1 ? (
              <span className={styles.agentName}>{state.agents[0]!.name}</span>
            ) : (
              <select
                aria-label="Agent"
                value={agentId}
                disabled={busy || Boolean(task)}
                onChange={(event) => setAgentId(event.target.value)}
              >
                {state.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            )}
            <span className={styles.keyboardHint}>
              {working ? 'You can keep working elsewhere' : '↵ to send'}
            </span>
            <LiquidMetalButton
              type="submit"
              viewMode="icon"
              size="compact"
              tone="sage"
              aria-label={busy ? 'Sending request' : 'Send request'}
              title="Send request"
              disabled={busy || working || !text.trim()}
            >
              <ArrowUp size={17} weight="bold" aria-hidden="true" />
            </LiquidMetalButton>
          </footer>
        </form>
      ) : (
        <div className={styles.empty}>
          <p>Your assistant is a moment away.</p>
          <button onClick={() => void openConversation()}>Open Sia to get started</button>
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </main>
  );
  return (
    <AppearanceContext value={state.appearance ?? 'expressive'}>{content}</AppearanceContext>
  );
}
