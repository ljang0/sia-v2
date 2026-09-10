// Phone interaction flow adapted from Notch RemoteControlServer.pageHTML (6c74c30):
// 500/1400ms polling, recent prompts, send/stop/dictate composer and visualViewport keyboard handling.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUp,
  Check,
  CircleNotch,
  Desktop,
  DownloadSimple,
  Microphone,
  Plus,
  SquaresFour,
  Stop,
  X,
  ArrowLeft,
} from '@phosphor-icons/react';
import type { RemoteState, RemoteTurn } from '../shared/phone-remote';
import { SiaMark } from '../renderer/components/SiaMark';
import { SafeMarkdown } from '../renderer/components/SafeMarkdown';
import { remoteBase, remoteRequest, RemoteRequestError, requestId } from './api';
import { MemoryGraph } from './memory-graph';
import '../renderer/tokens.css';
import './remote.css';

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: {
          [key: number]: { [key: number]: { transcript: string }; isFinal: boolean };
          length: number;
        };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
function App() {
  const [state, setState] = useState<RemoteState>();
  const [online, setOnline] = useState(false);
  const [connection, setConnection] = useState('Connecting to your Mac…');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [graph, setGraph] = useState(location.pathname.endsWith('/graph'));
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState('');
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('sia-remote-recents') ?? '[]');
      return Array.isArray(saved)
        ? saved
            .filter((entry): entry is string => typeof entry === 'string' && entry.length < 160)
            .slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const dictation = useRef<Recognition | undefined>(undefined);
  const retry = useRef<{ id: string; text: string; session: string | null } | undefined>(
    undefined,
  );
  const latest = state?.turns.at(-1);
  const busy = latest?.status === 'working' || latest?.status === 'waiting';

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | undefined;
    const poll = async () => {
      active?.abort();
      const requestController = new AbortController();
      active = requestController;
      const timeout = setTimeout(() => requestController.abort(), 10000);
      let working = false;
      try {
        const next = await remoteRequest<RemoteState>(
          'state',
          undefined,
          requestController.signal,
        );
        if (disposed || active !== requestController) return;
        setState(next);
        setOnline(true);
        setConnection('Connected to your Mac');
        working = next.turns.at(-1)?.status === 'working';
      } catch (cause) {
        if (disposed || active !== requestController) return;
        setOnline(false);
        setConnection(
          cause instanceof RemoteRequestError
            ? cause.message
            : 'Reconnecting… Keep Sia open and your Mac awake on the same Wi-Fi.',
        );
        if (cause instanceof RemoteRequestError && cause.status === 404) setState(undefined);
      } finally {
        clearTimeout(timeout);
        if (!disposed && active === requestController)
          timer = setTimeout(poll, document.hidden ? 5000 : working ? 500 : 1400);
      }
    };
    void poll();
    const resume = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  useEffect(() => {
    const resize = () => {
      document.documentElement.style.setProperty(
        '--phone-height',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
    };
    window.visualViewport?.addEventListener('resize', resize);
    resize();
    return () => window.visualViewport?.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (state?.turns.length && nearBottom.current)
      conversation.current?.scrollTo({
        top: conversation.current.scrollHeight,
        behavior: 'instant',
      });
  }, [state, graph]);
  useEffect(() => () => dictation.current?.abort(), []);

  const send = async (message = text) => {
    const trimmed = message.trim();
    if (!trimmed || pending || !online || latest?.status === 'working') return;
    setPending(true);
    setError('');
    dictation.current?.stop();
    if (!retry.current || retry.current.text !== trimmed)
      retry.current = { id: requestId(), text: trimmed, session: state?.session ?? null };
    try {
      await remoteRequest('command', retry.current);
      retry.current = undefined;
      setText('');
      nearBottom.current = true;
      const updated = [
        trimmed.slice(0, 140),
        ...recents.filter((entry) => entry !== trimmed),
      ].slice(0, 5);
      setRecents(updated);
      try {
        localStorage.setItem('sia-remote-recents', JSON.stringify(updated));
      } catch {
        /* Private browsing may disable storage. */
      }
      setState(await remoteRequest<RemoteState>('state'));
    } catch (cause) {
      if (cause instanceof RemoteRequestError) retry.current = undefined;
      setError(
        cause instanceof RemoteRequestError
          ? cause.message
          : 'Connection interrupted. Your message is kept here. Send again to safely retry.',
      );
    } finally {
      setPending(false);
    }
  };
  const action = async (path: 'cancel' | 'clear') => {
    if (pending || !online) return;
    setPending(true);
    setError('');
    setMenu(false);
    try {
      await remoteRequest(path, { session: state?.session ?? null });
      retry.current = undefined;
      setState(await remoteRequest<RemoteState>('state'));
      if (path === 'clear') {
        setText('');
        composer.current?.focus();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Try again when your Mac reconnects.');
    } finally {
      setPending(false);
    }
  };
  const microphone = () => {
    if (listening) {
      dictation.current?.stop();
      return;
    }
    const RecognitionClass =
      (
        window as unknown as {
          SpeechRecognition?: new () => Recognition;
          webkitSpeechRecognition?: new () => Recognition;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
        .webkitSpeechRecognition;
    if (!window.isSecureContext || !RecognitionClass) {
      composer.current?.focus();
      setHint('Tap the microphone on your phone’s keyboard to dictate.');
      return;
    }
    const recognition = new RecognitionClass();
    dictation.current = recognition;
    recognition.lang = navigator.language;
    recognition.interimResults = true;
    const original = text;
    recognition.onresult = (event) => {
      const words = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index]![0]!.transcript,
      ).join(' ');
      setText(`${original} ${words}`.trim().slice(0, 8000));
    };
    recognition.onerror = () => {
      setHint('Use your phone’s keyboard microphone to dictate.');
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
      setHint('Listening… Review your words, then send.');
    } catch {
      setHint('Use your phone’s keyboard microphone to dictate.');
    }
  };
  const chips = [
    ...new Set([
      ...recents.slice(0, 2),
      'What’s on my Mac right now?',
      'Organize my Downloads folder',
      'Summarize the page I have open',
    ]),
  ].slice(0, 3);
  return (
    <main className="phone-shell">
      <header className="phone-header">
        <div className="phone-brand">
          <SiaMark />
          <span>sia</span>
          <span className="phone-tag">remote</span>
        </div>
        <span
          className={`connection-dot ${online ? 'online' : ''}`}
          role="status"
          aria-label={online ? 'Connected to your Mac' : 'Mac disconnected'}
        >
          <i />
          {online ? 'On your Mac' : 'Reconnecting'}
        </span>
      </header>
      {graph ? (
        <>
          <div className="graph-heading">
            <button className="icon" aria-label="Back to chat" onClick={() => setGraph(false)}>
              <ArrowLeft size={21} />
            </button>
            <div>
              <h1>Your assistant’s memory</h1>
              <p>Explore what {state?.agent ?? 'Sia'} has learned.</p>
            </div>
          </div>
          <MemoryGraph online={online} />
        </>
      ) : (
        <>
          <div className="phone-context">
            <Desktop size={15} />
            <span>
              {state?.agent ?? 'Sia'}{' '}
              <span className="muted">
                · {state?.mode === 'connected' ? 'Connected apps' : 'Use my Mac'}
              </span>
            </span>
            {state && (
              <span className="context-approval">
                {state.approval === 'auto' ? 'Full bypass' : 'Ask first'}
              </span>
            )}
          </div>
          {!online && (
            <p className="connection-banner" role="status">
              {connection}
            </p>
          )}
          <div
            className="conversation"
            ref={conversation}
            onScroll={() => {
              const node = conversation.current;
              if (node)
                nearBottom.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 140;
            }}
          >
            {!state?.turns.length ? (
              <div className="remote-empty">
                <div className="hero-mark">
                  <SiaMark />
                </div>
                <span className="eyebrow">A LITTLE DISTANCE. SAME ASSISTANT.</span>
                <h1>
                  Your Mac,
                  <br />
                  within reach.
                </h1>
                <p>
                  Ask from here.
                  <br />
                  Sia takes care of it on your Mac.
                </p>
                <div className="remote-chips">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => {
                        setText(chip);
                        composer.current?.focus();
                      }}
                    >
                      {chip}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="turns">
                {state.turns.map((turn) => (
                  <Turn key={turn.id} turn={turn} agent={state.agent} />
                ))}
              </div>
            )}
          </div>
          <footer className="phone-footer">
            {error && (
              <div className="remote-error" role="alert">
                {error}
                <button
                  className="icon"
                  aria-label="Dismiss error"
                  onClick={() => setError('')}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {hint && (
              <p className="composer-hint" role="status">
                {hint}
              </p>
            )}
            {menu && (
              <div className="composer-menu">
                <button
                  onClick={() => {
                    setGraph(true);
                    setMenu(false);
                  }}
                >
                  <SquaresFour size={18} />
                  Memory graph
                </button>
                <button
                  disabled={busy || pending || !online}
                  onClick={() => void action('clear')}
                >
                  <Plus size={18} />
                  New chat
                </button>
                <button
                  onClick={() => {
                    setRecents([]);
                    try {
                      localStorage.removeItem('sia-remote-recents');
                    } catch {
                      /* Storage unavailable. */
                    }
                    setMenu(false);
                  }}
                >
                  Clear recent prompts on this phone
                </button>
              </div>
            )}
            <form
              className={`remote-composer ${listening ? 'listening' : ''}`}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <button
                type="button"
                className="icon"
                aria-label={menu ? 'Close menu' : 'More options'}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={22} /> : <Plus size={22} />}
              </button>
              <textarea
                ref={composer}
                aria-label="Message Sia"
                rows={1}
                maxLength={8000}
                value={text}
                placeholder={busy ? 'Add a follow-up…' : 'Ask Sia anything…'}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  event.currentTarget.style.height = 'auto';
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              {busy && (!text.trim() || latest?.status === 'working') ? (
                <button
                  type="button"
                  className="send stop"
                  disabled={pending || !online}
                  aria-label="Stop task"
                  onClick={() => void action('cancel')}
                >
                  <Stop size={17} weight="fill" />
                </button>
              ) : text.trim() ? (
                <button
                  className="send"
                  disabled={pending || !online}
                  aria-label="Send message"
                >
                  {pending ? <CircleNotch className="spin" size={20} /> : <ArrowUp size={22} />}
                </button>
              ) : (
                <button
                  type="button"
                  className={`send ${listening ? 'stop' : ''}`}
                  aria-label={listening ? 'Stop dictation' : 'Dictate message'}
                  disabled={pending}
                  onClick={microphone}
                >
                  <Microphone size={21} />
                </button>
              )}
            </form>
            <div className="footer-caption">
              {pending
                ? 'Sending to your Mac…'
                : busy
                  ? 'You can leave this page. Sia keeps working.'
                  : state && state.workers > 0
                    ? `${state.workers} ${state.workers === 1 ? 'task is' : 'tasks are'} running on your Mac.`
                    : 'Same Wi-Fi. Sia open. Mac awake.'}
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
function Turn({ turn, agent }: { turn: RemoteTurn; agent: string }) {
  return (
    <section className="remote-turn">
      <div className="user-message">{turn.text}</div>
      <div className="assistant-heading">
        <SiaMark state={turn.status === 'working' ? 'working' : 'idle'} />
        <strong>{agent}</strong>
        <span>
          {turn.status === 'working' ? (
            <>
              <span className="working-dot" />
              Working
            </>
          ) : turn.status === 'waiting' ? (
            'Needs you'
          ) : turn.status === 'cancelled' ? (
            'Stopped'
          ) : turn.status === 'error' ? (
            'Needs attention'
          ) : (
            <>
              <Check size={13} />
              Finished
            </>
          )}
        </span>
      </div>
      {turn.steps.length > 0 && (
        <details className="task-steps">
          <summary>
            {turn.status === 'working'
              ? turn.steps.at(-1)
              : `${turn.steps.length} ${turn.steps.length === 1 ? 'step' : 'steps'}`}
          </summary>
          <ol>
            {turn.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </details>
      )}
      {turn.response && (
        <div className="remote-response">
          <SafeMarkdown content={turn.response} />
        </div>
      )}
      {turn.status === 'working' && !turn.response && (
        <div className="thinking-dots" aria-label="Sia is thinking">
          <i />
          <i />
          <i />
        </div>
      )}
      {turn.error && <p className="task-error">{turn.error}</p>}
      {turn.status === 'waiting' && (
        <p className="waiting-note">
          Reply below if Sia asked a question. Approve computer actions in Sia on your Mac.
        </p>
      )}
      {turn.files.map((file) => (
        <a
          className="result-file"
          href={new URL(`outbox/${encodeURIComponent(file)}`, remoteBase).href}
          download={file}
          key={file}
        >
          <DownloadSimple size={19} />
          <span>{file}</span>
          <span className="muted">Save</span>
        </a>
      ))}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
