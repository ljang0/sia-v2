import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChatsCircle,
  ArrowsOutCardinal,
  Moon,
  PawPrint,
  Plus,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { ScottyAction, ScottyApi, ScottyState, ScottyStatus } from '../../shared/scotty';
import { ScottySprite, type ScottyPose } from './ScottySprite';
import styles from './Scotty.module.css';
import { useTextSize } from '../textSize';
const empty: ScottyState = {
  revision: -1,
  settings: { enabled: false, size: 'medium', motion: true },
  available: false,
  status: 'idle',
  agents: [],
  tasks: [],
  workingCount: 0,
  attentionCount: 0,
  moreTasks: false,
};
const labels: Record<ScottyStatus, string> = {
  idle: 'Here with you',
  working: 'Working',
  input: 'Needs you',
  ready: 'Ready',
  blocked: 'Needs attention',
};
const poses: Record<ScottyStatus, ScottyPose> = {
  idle: 'idle',
  working: 'working',
  input: 'curious',
  ready: 'happy',
  blocked: 'curious',
};
function useScotty(api: ScottyApi) {
  const [state, setState] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let received = false;
    const receive = (next: ScottyState) => {
      if (active) {
        received = true;
        setState(next);
      }
    };
    const unsubscribe = api.onState(receive);
    void api
      .state()
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {
        if (active) setError('Scotty could not connect to Sia.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);
  useTextSize(state.textSize);
  return { state, error, setError };
}
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
        <ScottySprite pose={pose} size={size} motion={state.settings.motion} />
      </button>
      <button
        data-scotty-hit
        className={styles.badge}
        onClick={() => run(api.expand(true))}
        aria-label="Open Scotty tasks"
      >
        <span className={styles.dot} />
        {error ? 'Open Sia' : labels[state.status]}
        {state.attentionCount > 0 ? (
          <b>{state.attentionCount}</b>
        ) : state.workingCount > 0 ? (
          <b>{state.workingCount}</b>
        ) : null}
      </button>
    </main>
  );
}

export function ScottyPanel({ api = window.siaScotty }: { api?: ScottyApi }) {
  const { state, error, setError } = useScotty(api);
  const [selectedId, setSelectedId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const task = state.tasks.find((item) => item.id === selectedId);
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
    try {
      const result = await api.action(action);
      if (action.kind === 'new') {
        setComposing(false);
        setSelectedId(result.threadId);
      }
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete this action.');
    } finally {
      setBusy(false);
    }
  }
  const control = (promise: Promise<unknown>) => {
    void promise.catch(() => setError('Could not update Scotty.'));
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
      className={styles.panel}
      data-motion={state.settings.motion}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          control(api.expand(false));
        }
      }}
    >
      <header className={styles.header}>
        <span className={styles.avatar}>
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
          onClick={() => control(api.hide())}
        >
          <Moon size={15} />
        </button>
        <button
          className={styles.icon}
          title="Close task tray"
          aria-label="Close task tray"
          onClick={() => control(api.expand(false))}
        >
          <X size={16} />
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
          <button className={styles.primary} onClick={() => control(api.openSia())}>
            Open Sia
          </button>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            {task || composing ? (
              <button className={styles.textButton} onClick={back}>
                <ArrowLeft size={14} /> All tasks
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
                <Plus size={14} /> Ask Sia
              </button>
            )}
          </div>
          <div className={styles.content}>
            {composing ? (
              <section className={styles.composeIntro}>
                <h2>What can we do for you?</h2>
                <p>Scotty brings your request to your Sia agent and stays with it.</p>
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
                  <button className={styles.primary} onClick={() => control(api.openSia())}>
                    Set up an agent in Sia
                  </button>
                )}
              </section>
            ) : task ? (
              <section className={styles.detail}>
                <span className={styles.eyebrow}>{task.agent}</span>
                <h2>{task.title}</h2>
                <p className={styles.progress} data-status={task.status} role="status">
                  <span className={styles.dot} />
                  {task.progress}
                </p>
                {task.screen && (
                  <small className={styles.screen}>
                    {task.screen === 'foreground'
                      ? 'Using your screen · Press Esc to stop'
                      : 'Working quietly in the background'}
                  </small>
                )}
                {task.response && (
                  <div className={styles.response}>
                    {task.truncated && (
                      <small>
                        Latest part of the response. Open Sia for the full conversation.
                      </small>
                    )}
                    {task.response}
                  </div>
                )}
                {task.question && (
                  <div className={styles.question}>
                    <span>A question for you</span>
                    <p>{task.question}</p>
                  </div>
                )}
                {task.approval && (
                  <section className={styles.approval} aria-label="Review action">
                    <h3>{task.approval.title}</h3>
                    <p>{task.approval.summary}</p>
                    <dl>
                      <dt>Target</dt>
                      <dd>{task.approval.target}</dd>
                      {task.approval.account && (
                        <>
                          <dt>Account</dt>
                          <dd>{task.approval.account}</dd>
                        </>
                      )}
                      {task.approval.dataLeaving && (
                        <>
                          <dt>Data leaving your Mac</dt>
                          <dd>{task.approval.dataLeaving}</dd>
                        </>
                      )}
                      <dt>Reversible</dt>
                      <dd>{task.approval.reversible ? 'Yes' : 'No'}</dd>
                    </dl>
                    {task.approval.requiresMainApp ? (
                      <button
                        className={styles.primary}
                        onClick={() => void act({ kind: 'open', token: task.token })}
                      >
                        Review full action in Sia
                      </button>
                    ) : (
                      <div className={styles.actions}>
                        <button
                          disabled={busy}
                          className={styles.secondary}
                          onClick={() =>
                            void act({
                              kind: 'approve',
                              token: task.token,
                              approvalId: task.approval!.id,
                              decision: 'deny',
                            })
                          }
                        >
                          Deny
                        </button>
                        <button
                          disabled={busy}
                          className={styles.primary}
                          onClick={() =>
                            void act({
                              kind: 'approve',
                              token: task.token,
                              approvalId: task.approval!.id,
                              decision: 'approve',
                            })
                          }
                        >
                          Approve once
                        </button>
                      </div>
                    )}
                  </section>
                )}
                <div className={styles.actions}>
                  {task.canStop && (
                    <button
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => void act({ kind: 'cancel', token: task.token })}
                    >
                      Stop task
                    </button>
                  )}
                  {task.unread && !task.canStop && (
                    <button
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => void act({ kind: 'read', token: task.token })}
                    >
                      <Check size={13} /> Mark read
                    </button>
                  )}
                  <button
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() => void act({ kind: 'open', token: task.token })}
                  >
                    Open in Sia <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
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
                    <span className={styles.dot} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.agent} · {item.progress}
                      </span>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ))}
                {state.moreTasks && (
                  <button className={styles.textButton} onClick={() => control(api.openSia())}>
                    See all conversations in Sia <ArrowUpRight size={13} />
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
                  <Plus size={15} /> Start a request
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
                <ArrowUp size={17} />
              </button>
            </form>
          )}
        </>
      )}
      <footer className={styles.footer}>
        <span>
          <PawPrint size={12} /> Sia · on your Mac
        </span>
        <button
          className={styles.icon}
          aria-label="Move Scotty with buttons"
          title="Move Scotty"
          aria-expanded={moving}
          onClick={() => setMoving(!moving)}
        >
          <ArrowsOutCardinal size={15} />
        </button>
        <button
          className={styles.icon}
          aria-label="Open Sia"
          title="Open Sia"
          onClick={() => control(api.openSia())}
        >
          <ChatsCircle size={16} />
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
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
