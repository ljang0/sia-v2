import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  ArrowRight,
  Browsers,
  CalendarBlank,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  FolderSimple,
  Sparkle,
  Stack,
  X,
} from '@phosphor-icons/react';
import type { RemoteTurn } from '../shared/phone-remote';
import { SiaLogo } from '../renderer/components/SiaLogo';
import { LiquidMetalButton } from '../renderer/components/effects/liquid-metal-button';
import { timeGreeting } from '../renderer/welcome';
import { plainText } from '../shared/plain-text';

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  closeLabel = 'Close panel',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  closeLabel?: string;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          className="phone-sheet"
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
        >
          <div className="sheet-handle" aria-hidden="true" />
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon" aria-label={closeLabel}>
              <X size={22} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ideas = [
  {
    icon: CalendarBlank,
    title: 'Plan my week',
    detail: 'A little more headspace.',
    prompt:
      'Help me plan my week. Check my calendar and upcoming commitments, then suggest a realistic plan.',
  },
  {
    icon: Browsers,
    title: 'Pick up where I left off',
    detail: 'From tabs to takeaways.',
    prompt: 'Summarize the page I have open on my Mac and suggest the next steps.',
  },
  {
    icon: FolderSimple,
    title: 'Find that file',
    detail: 'Less looking. More finding.',
    prompt: 'Help me find a file on my Mac. Ask me what I remember about it first.',
  },
  {
    icon: Sparkle,
    title: 'Make something',
    detail: 'An idea into a first draft.',
    prompt: 'Help me turn an idea into a document. Ask me what I want to create first.',
  },
];
export function Welcome({
  agent,
  recents,
  onChoose,
  typing,
}: {
  agent?: string | undefined;
  recents: string[];
  onChoose: (text: string) => void;
  typing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const suggestions = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Measure the natural height so wrapping, more ideas, and recents all ease correctly.
    const measure = () =>
      suggestions.current?.style.setProperty(
        '--suggestions-height',
        `${content.current!.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="remote-empty">
      <div className="hero-art" aria-hidden="true">
        <div className="hero-presence">
          <SiaLogo />
        </div>
      </div>
      <div className="hero-copy">
        <span className="eyebrow welcome-greeting">
          {timeGreeting()}
          {agent ? ` · With ${agent}` : ''}
        </span>
        <h1>
          Your Mac,
          <br />
          <span>within reach.</span>
        </h1>
        <p>
          Big ideas. Little errands.
          <br />
          Hand them off from wherever you are.
        </p>
      </div>
      <div
        className="welcome-suggestions"
        ref={suggestions}
        inert={typing}
        aria-hidden={typing || undefined}
      >
        <div className="welcome-suggestions-content" ref={content}>
          <div className="ideas-heading">
            <span>A PLACE TO START</span>
            <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? 'Show less' : 'More ideas'}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="idea-grid">
            {ideas.slice(0, expanded ? 4 : 2).map((idea, index) => (
              <button
                className="idea-card"
                key={idea.title}
                data-tone={index % 2 === 0 ? 'sage' : 'sand'}
                onClick={() => onChoose(idea.prompt)}
              >
                <span className="idea-icon">
                  <idea.icon size={22} weight="duotone" />
                </span>
                <ArrowUpRight className="idea-arrow" size={16} />
                <strong>{idea.title}</strong>
                <span>{idea.detail}</span>
              </button>
            ))}
          </div>
          {!!recents.length && (
            <div className="recent-prompts">
              <span className="eyebrow">PICK IT BACK UP</span>
              {recents.slice(0, 2).map((prompt) => (
                <button key={prompt} onClick={() => onChoose(prompt)}>
                  <ClockCounterClockwise size={17} />
                  <span>{prompt}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export const statusLabels: Record<RemoteTurn['status'], string> = {
  working: 'Working',
  waiting: 'Needs you',
  done: 'Finished',
  error: 'Needs attention',
  cancelled: 'Stopped',
};
export function Activity({
  turns,
  online,
  onOpen,
  onStart,
}: {
  turns: RemoteTurn[];
  online: boolean;
  onOpen: (id: string) => void;
  onStart: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'files'>('all');
  const files = turns.filter((turn) => turn.files.length > 0).length;
  const active = turns.filter(
    (turn) => turn.status === 'working' || turn.status === 'waiting',
  ).length;
  const shown = [...turns].reverse().filter((turn) => filter === 'all' || turn.files.length);
  return (
    <section className="activity-page">
      <div className="page-heading">
        <span className="eyebrow">OFF YOUR PLATE. RIGHT HERE.</span>
        <h1>A little less to do.</h1>
        <p>
          {active
            ? `${active} ${active === 1 ? 'task in motion' : 'tasks in motion'}. ${online ? 'Follow along below.' : 'Reconnecting for updates.'}`
            : 'Every request, reply, and result in this chat.'}
        </p>
      </div>
      <div className="activity-filters" aria-label="Task filter">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All tasks <span>{turns.length}</span>
        </button>
        <button aria-pressed={filter === 'files'} onClick={() => setFilter('files')}>
          With files <span>{files}</span>
        </button>
      </div>
      <div className="activity-scroll">
        {shown.length ? (
          <div className="task-list">
            {shown.map((turn) => (
              <button key={turn.id} className="task-card" onClick={() => onOpen(turn.id)}>
                <div className="task-card-top">
                  <span className="turn-status" data-status={turn.status}>
                    {turn.status === 'done' ? (
                      <Check size={13} />
                    ) : turn.status === 'working' ? (
                      <CircleNotch size={13} className="spin" />
                    ) : (
                      <span className="status-disc" />
                    )}
                    {statusLabels[turn.status]}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
                <h2>{turn.text}</h2>
                <p>
                  {turn.status === 'working'
                    ? turn.steps.at(-1) || 'Getting started on your Mac…'
                    : turn.status === 'waiting'
                      ? 'Open the conversation to see what Sia needs.'
                      : turn.status === 'error'
                        ? turn.error || 'Open the conversation for details.'
                        : turn.status === 'cancelled'
                          ? 'You stopped this task.'
                          : plainText(turn.response) || 'Your reply is ready to read.'}
                </p>
                {!!turn.files.length && (
                  <span className="task-file-count">
                    <FolderSimple size={15} />
                    {turn.files.length} {turn.files.length === 1 ? 'file ready' : 'files ready'}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <span className="empty-symbol">
              <Stack size={32} weight="duotone" />
            </span>
            <h2>
              {filter === 'files' ? 'Good things take shape.' : 'Room for your next idea.'}
            </h2>
            <p>
              {filter === 'files'
                ? 'Files Sia creates in this chat will be easy to find here.'
                : 'Ask Sia to take something off your list. You can follow its progress here.'}
            </p>
            <LiquidMetalButton className="text-action" tone="sage" onClick={onStart}>
              Ask Sia
              <ArrowRight size={17} />
            </LiquidMetalButton>
          </div>
        )}
      </div>
    </section>
  );
}
