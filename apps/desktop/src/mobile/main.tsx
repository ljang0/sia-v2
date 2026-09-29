// Phone interaction flow adapted from Notch RemoteControlServer.pageHTML (6c74c30):
// 500/1400ms polling, recent prompts, send/stop/dictate composer and visualViewport keyboard handling.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUp,
  ArrowDown,
  CircleNotch,
  Desktop,
  Microphone,
  Plus,
  Stop,
  X,
  ChatCircle,
  Stack,
  Graph,
  ArrowUpRight,
  DotsThree,
  WifiHigh,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react';
import type { RemoteState } from '../shared/phone-remote';
import { SiaLogo } from '../renderer/components/SiaLogo';
import { remoteRequest, RemoteRequestError, requestId } from './api';
import { MemoryGraph } from './memory-graph';
import { DitherAurora as Aurora } from '../renderer/components/effects/DitherAurora';
import { usePhoneViewport } from './use-phone-viewport';
import { LiquidMetalButton } from '../renderer/components/effects/liquid-metal-button';
import { Sheet, Welcome, Activity, statusLabels } from './remote-ui';
import { Turn } from './turn';
import { useViewTransition } from '../renderer/components/effects/use-view-transition';
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
  const keyboardOpen = usePhoneViewport();
  const [state, setState] = useState<RemoteState>();
  const [online, setOnline] = useState(false);
  const [connection, setConnection] = useState('Connecting to your Mac…');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'options' | 'connection'>('options');
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = (next: 'options' | 'connection') => {
    setSheet(next);
    setSheetOpen(true);
  };
  const [view, setView] = useState<'chat' | 'activity' | 'memory'>(
    location.pathname.endsWith('/graph') ? 'memory' : 'chat',
  );
  const viewSurface = useRef<HTMLDivElement>(null);
  useViewTransition(viewSurface, view);
  const [showLatest, setShowLatest] = useState(false);
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
    if (state?.turns.length && nearBottom.current)
      conversation.current?.scrollTo({
        top: conversation.current.scrollHeight,
        behavior: 'instant',
      });
  }, [state, view]);
  useEffect(() => () => dictation.current?.abort(), []);
  useEffect(() => {
    if (view !== 'chat') {
      dictation.current?.stop();
      setListening(false);
    }
  }, [view]);

  useEffect(() => {
    const node = composer.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 130)}px`;
    }
  }, [text, view]);
  const refreshAfterAction = async () => {
    try {
      setState(await remoteRequest<RemoteState>('state'));
    } catch {
      setOnline(false);
      setConnection('Sent to your Mac. Reconnecting for updates…');
    }
  };
  const choosePrompt = (prompt: string) => {
    setText(prompt);
    setHint('');
    composer.current?.focus({ preventScroll: true });
  };
  const openTurn = (id: string) => {
    nearBottom.current = false;
    setView('chat');
    requestAnimationFrame(() => {
      document
        .getElementById(`turn-${id}`)
        ?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  const send = async (message = text) => {
    const trimmed = message.trim();
    if (!trimmed || pending || !online || latest?.status === 'working') return;
    setPending(true);
    setError('');
    dictation.current?.stop();
    setHint('');
    if (!retry.current || retry.current.text !== trimmed)
      retry.current = { id: requestId(), text: trimmed, session: state?.session ?? null };
    try {
      await remoteRequest('command', retry.current);
      retry.current = undefined;
      setText((current) => (current.trim() === trimmed ? '' : current));
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
      await refreshAfterAction();
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
    setSheetOpen(false);
    try {
      await remoteRequest(path, { session: state?.session ?? null });
      retry.current = undefined;
      await refreshAfterAction();
      if (path === 'clear') {
        setText('');
        nearBottom.current = true;
        setView('chat');
        composer.current?.focus({ preventScroll: true });
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
      composer.current?.focus({ preventScroll: true });
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
    recognition.onend = () => {
      setListening(false);
      setHint((current) =>
        current.startsWith('Listening…') ? 'Review your words, then send.' : current,
      );
    };
    try {
      recognition.start();
      setListening(true);
      setHint('Listening… Review your words, then send.');
    } catch {
      setHint('Use your phone’s keyboard microphone to dictate.');
    }
  };
  return (
    <main
      className="phone-shell"
      data-scene={view === 'chat' && !state?.turns.length ? 'welcome' : 'workspace'}
    >
      <Aurora className="phone-aurora" />
      <span className="visually-hidden" role="status">
        {latest && online ? `Last task: ${statusLabels[latest.status]}.` : ''}
      </span>
      <header className="phone-header">
        <div className="phone-brand" aria-label="Sia">
          <SiaLogo />
        </div>
        <LiquidMetalButton
          className={`connection-pill ${online ? 'online' : ''}`}
          onClick={() => openSheet('connection')}
          aria-label="Connection details"
        >
          <span
            className="connection-dot"
            role="status"
            aria-label={online ? 'Connected to your Mac' : 'Mac disconnected'}
          >
            <i />
          </span>
          {online ? 'Mac connected' : 'Reconnecting'}
          <Desktop size={15} />
        </LiquidMetalButton>
        <button
          className="icon header-more"
          aria-label="More options"
          onClick={() => openSheet('options')}
        >
          <DotsThree size={25} weight="bold" />
        </button>
      </header>
      {!online && (
        <p className="connection-banner" role="status">
          {connection}
        </p>
      )}
      <div className="phone-view" ref={viewSurface} data-phone-view={view}>
        {view === 'memory' ? (
          <>
            <div className="page-heading">
              <span className="eyebrow">A LITTLE MORE YOU, EVERY DAY</span>
              <h1>Made of memories.</h1>
              <p>What {state?.agent ?? 'Sia'} has learned along the way.</p>
            </div>
            {state ? (
              <MemoryGraph online={online} />
            ) : (
              <div className="memory-empty">
                <p>Reconnect to your Mac to see your memories.</p>
              </div>
            )}
          </>
        ) : view === 'activity' ? (
          <Activity
            turns={state?.turns ?? []}
            online={online}
            onOpen={openTurn}
            onStart={() => setView('chat')}
          />
        ) : (
          <>
            {!!state?.turns.length && (
              <div className="conversation-heading">
                <div>
                  <span className="assistant-avatar">
                    <SiaLogo />
                  </span>
                  <span>
                    <strong>{state.agent}</strong>
                    <small>
                      {state.mode === 'connected' ? 'Connected apps' : 'Working with your Mac'}
                    </small>
                  </span>
                </div>
                <button
                  className="icon"
                  aria-label="New chat"
                  disabled={busy || pending || !online}
                  onClick={() => void action('clear')}
                >
                  <Plus size={21} />
                </button>
              </div>
            )}
            <div
              className="conversation"
              ref={conversation}
              onScroll={() => {
                const node = conversation.current;
                if (node) {
                  nearBottom.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 100;
                  setShowLatest(!nearBottom.current);
                }
              }}
            >
              {!state?.turns.length ? (
                <Welcome
                  agent={state?.agent}
                  recents={recents}
                  onChoose={choosePrompt}
                  typing={keyboardOpen}
                />
              ) : (
                <div className="turns">
                  {state.turns.map((turn) => (
                    <Turn key={turn.id} turn={turn} agent={state.agent} />
                  ))}
                </div>
              )}
            </div>
            <footer className="phone-footer">
              {showLatest && !!state?.turns.length && (
                <button
                  className="jump-latest"
                  onClick={() => {
                    nearBottom.current = true;
                    conversation.current?.scrollTo({
                      top: conversation.current.scrollHeight,
                      behavior: 'instant',
                    });
                    setShowLatest(false);
                  }}
                >
                  <ArrowDown size={14} />
                  Latest reply
                </button>
              )}
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
              {busy && (
                <div className="live-task-line" role="status">
                  <span className={`activity-light ${latest?.status}`} />
                  {latest?.approval
                    ? 'Approve this step on your Mac'
                    : latest?.status === 'waiting'
                      ? 'Sia needs your answer'
                      : online
                        ? 'Sia is working on your Mac'
                        : 'Reconnecting for task updates'}
                  <span>
                    {latest?.status === 'working'
                      ? 'You can leave this page'
                      : latest?.approval
                        ? 'Your phone can’t approve'
                        : 'Reply below'}
                  </span>
                </div>
              )}
              <form
                className={`remote-composer ${listening ? 'listening' : ''}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={composer}
                  aria-label="Message Sia"
                  rows={1}
                  maxLength={8000}
                  value={text}
                  placeholder={
                    latest?.approval
                      ? 'Approve on your Mac to continue'
                      : latest?.status === 'waiting'
                        ? 'Answer Sia…'
                        : busy
                          ? 'Write a follow-up…'
                          : 'What can I take off your hands?'
                  }
                  onChange={(event) => setText(event.currentTarget.value)}
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
                <div className="composer-controls">
                  <span className="composer-context">
                    <Desktop size={14} />
                    {state?.mode === 'connected' ? 'Connected apps' : 'Use my Mac'}
                  </span>
                  <LiquidMetalButton
                    type="button"
                    viewMode="icon"
                    tone={listening ? 'danger' : 'neutral'}
                    className={`icon ${listening ? 'recording' : ''}`}
                    aria-label={listening ? 'Stop dictation' : 'Dictate message'}
                    disabled={pending}
                    onClick={microphone}
                  >
                    <Microphone size={20} />
                  </LiquidMetalButton>
                  {busy && (!text.trim() || latest?.status === 'working') ? (
                    <LiquidMetalButton
                      type="button"
                      className="send stop"
                      viewMode="icon"
                      tone="danger"
                      disabled={pending || !online}
                      aria-label="Stop task"
                      onClick={() => void action('cancel')}
                    >
                      <Stop size={16} weight="fill" />
                    </LiquidMetalButton>
                  ) : (
                    <LiquidMetalButton
                      type="submit"
                      viewMode="icon"
                      tone="sage"
                      className="send"
                      disabled={!text.trim() || pending || !online}
                      aria-label="Send message"
                    >
                      {pending ? (
                        <CircleNotch className="spin" size={20} />
                      ) : (
                        <ArrowUp size={21} weight="bold" />
                      )}
                    </LiquidMetalButton>
                  )}
                </div>
              </form>
              <div className="footer-caption">
                {pending
                  ? 'Sending to your Mac…'
                  : latest?.status === 'working' && text.trim()
                    ? 'Your follow-up is ready to send when this task finishes.'
                    : state && state.workers > 0 && !busy
                      ? `${state.workers} ${state.workers === 1 ? 'task is' : 'tasks are'} running on your Mac.`
                      : ''}
              </div>
            </footer>
          </>
        )}
      </div>
      <nav
        className="phone-nav"
        aria-label="Main navigation"
        inert={keyboardOpen}
        aria-hidden={keyboardOpen || undefined}
      >
        {(
          [
            { id: 'chat', label: 'Chat', icon: ChatCircle },
            { id: 'activity', label: 'Tasks', icon: Stack },
            { id: 'memory', label: 'Memory', icon: Graph },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => {
              setView(item.id);
              setHint('');
            }}
          >
            <span className="nav-icon">
              <item.icon size={21} weight={view === item.id ? 'fill' : 'regular'} />
              {item.id === 'activity' && busy && <i className="nav-dot" />}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={
          sheet === 'connection'
            ? online
              ? 'Your Mac, connected.'
              : 'Let’s reconnect.'
            : 'Make yourself at home.'
        }
        description={
          sheet === 'connection'
            ? 'Your phone is a window into Sia on your Mac.'
            : 'A few things to keep close.'
        }
      >
        {sheet === 'connection' ? (
          <>
            <div className="device-card">
              <div className="device-icon">
                <Desktop size={38} weight="duotone" />
              </div>
              <strong>{state?.agent ?? 'Sia'} on your Mac</strong>
              <span className={`device-status ${online ? 'online' : ''}`}>
                <i />
                {online ? 'Connected and ready' : 'Waiting for your Mac'}
              </span>
            </div>
            <div className="connection-facts">
              <p>
                <WifiHigh size={20} />
                <span>
                  <strong>Stay on the same Wi-Fi</strong>
                  <small>Keep Sia open and your Mac awake.</small>
                </span>
              </p>
              <p>
                <ShieldCheck size={20} />
                <span>
                  <strong>Confirm actions on your Mac</strong>
                  <small>
                    Requests from your phone always ask on your Mac before Sia acts, even with
                    full bypass on.
                  </small>
                </span>
              </p>
            </div>
            {!online && <p className="connection-banner">{connection}</p>}
          </>
        ) : (
          <div className="sheet-actions">
            <button disabled={busy || pending || !online} onClick={() => void action('clear')}>
              <Plus size={22} />
              <span>
                <strong>New chat</strong>
                <small>Start fresh. Keep your history on your Mac.</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
            <button
              onClick={() => {
                setView('memory');
                setSheetOpen(false);
              }}
            >
              <Graph size={22} />
              <span>
                <strong>Memory graph</strong>
                <small>Explore what your assistant remembers.</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
            <button
              onClick={() => {
                setRecents([]);
                try {
                  localStorage.removeItem('sia-remote-recents');
                } catch {
                  /* Storage unavailable. */
                }
                setSheetOpen(false);
              }}
            >
              <Trash size={22} />
              <span>
                <strong>Clear recent prompts</strong>
                <small>Only removes suggestions on this phone.</small>
              </span>
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
