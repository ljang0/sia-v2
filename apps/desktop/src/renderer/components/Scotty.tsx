import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChatsCircle,
  ArrowsOutCardinal,
  Moon,
  PawPrint,
  Plus,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { ScottyAction, ScottyApi } from '../../shared/scotty';
import { ScottySprite } from './ScottySprite';
import styles from './Scotty.module.css';
import { errorMessage } from '../plainErrors';
import { dismissMotion, summon } from './floatingMotion';
import { ScottyTaskDetail } from './ScottyTaskDetail';
import { poses, useScotty } from './useScotty';
export { ScottyPet } from './ScottyPet';

export function ScottyPanel({ api = window.siaScotty }: { api?: ScottyApi }) {
  const { state, error, setError } = useScotty(api);
  const [selectedId, setSelectedId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLElement>(null);
  const exit = useRef<Animation | undefined>(undefined);
  const away = useRef(false);
  const motion = state.settings.motion;
  const loaded = state.revision >= 0;
  const task = state.tasks.find((item) => item.id === selectedId);
  // The tray window is shown and hidden, not remounted: arrive once loaded, and again whenever it
  // returns after closing itself. Clicking back into an open tray does not replay the arrival.
  useEffect(() => {
    if (!loaded) return;
    summon([root.current!], motion);
    const returned = () => {
      exit.current?.cancel();
      exit.current = undefined;
      if (away.current) summon([root.current!], motion);
      away.current = false;
    };
    window.addEventListener('focus', returned);
    return () => window.removeEventListener('focus', returned);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrive once per load, not per toggle
  }, [loaded]);
  useEffect(() => {
    setAgentId((current) =>
      state.agents.some((agent) => agent.id === current)
        ? current
        : (state.agentId ?? state.agents[0]?.id ?? ''),
    );
  }, [state.agents, state.agentId]);
  useEffect(() => {
    setText('');
    setError('');
  }, [selectedId, task?.token, composing, setError]);
  useEffect(() => {
    if (composing || task?.question) field.current?.focus();
  }, [composing, task?.question]);
  useEffect(() => {
    if (!state.available) {
      setText('');
      setSelectedId(undefined);
      setComposing(false);
    }
  }, [state.available]);
  async function act(action: ScottyAction) {
    if (busy) return;
    setBusy(true);
    setError('');
    if (action.kind === 'open') away.current = true;
    try {
      const result = await api.action(action);
      if (action.kind === 'new') {
        setComposing(false);
        setSelectedId(result.threadId);
      }
      setText('');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not complete this action.'));
    } finally {
      setBusy(false);
    }
  }
  const control = (promise: Promise<unknown>) => {
    void promise.catch(() => setError('Could not update Scotty.'));
  };
  // Opening Sia hides the tray at once (navigation never waits); it arrives again next time.
  const openSia = () => {
    away.current = true;
    control(api.openSia());
  };
  // Closing plays a short exit, quicker than the arrival, then hides the window.
  const leave = (close: () => Promise<unknown>) => {
    away.current = true;
    if (exit.current) return;
    const animation = dismissMotion(root.current, motion);
    exit.current = animation;
    void (animation?.finished ?? Promise.resolve())
      .catch(() => undefined)
      .then(close)
      .catch(() => {
        exit.current?.cancel();
        exit.current = undefined;
        away.current = false;
        setError('Could not update Scotty.');
      });
  };
  const send = () => {
    if (!text.trim() || busy || !state.available) return;
    if (composing && agentId) void act({ kind: 'new', agentId, text });
    else if (task?.canReply) void act({ kind: 'reply', token: task.token, text });
  };
  const back = () => {
    setSelectedId(undefined);
    setComposing(false);
  };
  return (
    <main
      ref={root}
      className={styles.panel}
      data-motion={motion}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          leave(() => api.expand(false));
        }
      }}
    >
      <header className={styles.header}>
        <span key={state.status} className={styles.avatar} data-status={state.status}>
          <ScottySprite pose={poses[state.status]} size={44} motion={false} />
        </span>
        <div>
          <h1>Scotty</h1>
          <p>Your Sia companion</p>
        </div>
        <button
          className={styles.icon}
          title="Hide Scotty"
          aria-label="Hide Scotty"
          onClick={() => leave(() => api.hide())}
        >
          <Moon size={18} />
        </button>
        <button
          className={styles.icon}
          title="Close task tray"
          aria-label="Close task tray"
          onClick={() => leave(() => api.expand(false))}
        >
          <X size={18} />
        </button>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!state.available ? (
        <div className={styles.empty}>
          <PawPrint size={28} />
          <h2>See you in Sia</h2>
          <p>Open Sia to set up your assistant or sign in.</p>
          <button className={styles.primary} onClick={openSia}>
            Open Sia
          </button>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            {task || composing ? (
              <button className={styles.textButton} onClick={back}>
                <ArrowLeft size={16} /> All tasks
              </button>
            ) : (
              <span>
                {state.workingCount ? `${state.workingCount} working` : 'Your tasks'}
                {state.attentionCount > 0 && ` · ${state.attentionCount} need you`}
              </span>
            )}
            {!composing && (
              <button
                className={styles.textButton}
                disabled={busy}
                onClick={() => {
                  setSelectedId(undefined);
                  setComposing(true);
                }}
              >
                <Plus size={16} /> Ask Sia
              </button>
            )}
          </div>
          <div className={styles.content}>
            {composing ? (
              <section className={styles.composeIntro}>
                <h2>What can we do for you?</h2>
                <p>Scotty passes your request to Sia and keeps you posted.</p>
                <label className={styles.agent}>
                  Agent
                  <select
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    disabled={busy}
                  >
                    {state.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!state.agents.length && (
                  <button className={styles.primary} onClick={openSia}>
                    Set up an agent in Sia
                  </button>
                )}
              </section>
            ) : task ? (
              <ScottyTaskDetail task={task} busy={busy} act={act} />
            ) : selectedId ? (
              <div className={styles.empty}>
                <p>This task is no longer available.</p>
                <button className={styles.textButton} onClick={back}>
                  Back to tasks
                </button>
              </div>
            ) : state.tasks.length ? (
              <div className={styles.taskList}>
                {state.tasks.map((item) => (
                  <button
                    className={styles.task}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    data-status={item.status}
                  >
                    <span key={item.status} className={styles.dot} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.agent} · {item.progress}
                      </span>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                ))}
                {state.moreTasks && (
                  <button className={styles.textButton} onClick={openSia}>
                    See all conversations in Sia <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.empty}>
                <ScottySprite pose="curious" size={112} motion={state.settings.motion} />
                <h2>
                  A little company.
                  <br />A lot of help.
                </h2>
                <p>Ask Sia to do something. I’ll keep an eye on how it’s going.</p>
                <button className={styles.primary} onClick={() => setComposing(true)}>
                  <Plus size={16} /> Start a request
                </button>
              </div>
            )}
          </div>
          {/* A running task or a pending approval has nothing to type; the tray keeps its room. */}
          {(composing || task?.canReply) && (
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <label className={styles.srOnly} htmlFor="scotty-message">
                {task?.question ? 'Answer Sia’s question' : 'Message your Sia agent'}
              </label>
              <textarea
                id="scotty-message"
                ref={field}
                value={text}
                maxLength={8000}
                rows={2}
                onChange={(event) => setText(event.target.value)}
                disabled={busy || (composing ? !agentId : !task?.canReply)}
                placeholder={
                  composing
                    ? 'Ask Sia to do something…'
                    : task?.question
                      ? 'Your answer…'
                      : 'Ask a follow-up…'
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="submit"
                className={styles.send}
                disabled={busy || !text.trim() || (composing ? !agentId : !task?.canReply)}
                aria-label={task?.question ? 'Send answer' : 'Send request'}
              >
                <ArrowUp size={18} />
              </button>
            </form>
          )}
        </>
      )}
      <footer className={styles.footer}>
        <span>
          <PawPrint size={16} /> Sia · on your Mac
        </span>
        <button
          className={styles.icon}
          aria-label="Move Scotty with buttons"
          title="Move Scotty"
          aria-expanded={moving}
          onClick={() => setMoving(!moving)}
        >
          <ArrowsOutCardinal size={18} />
        </button>
        <button
          className={styles.icon}
          aria-label="Open Sia"
          title="Open Sia"
          onClick={openSia}
        >
          <ChatsCircle size={18} />
        </button>
      </footer>
      {moving && (
        <div className={styles.moveControls} aria-label="Move Scotty">
          Move Scotty
          {(
            [
              [ArrowLeft, -20, 0, 'left'],
              [ArrowUp, 0, -20, 'up'],
              [ArrowDown, 0, 20, 'down'],
              [ArrowRight, 20, 0, 'right'],
            ] as const
          ).map(([Icon, dx, dy, name]) => (
            <button
              key={name}
              className={styles.icon}
              aria-label={`Move Scotty ${name}`}
              onClick={() => control(api.nudge(dx, dy))}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
