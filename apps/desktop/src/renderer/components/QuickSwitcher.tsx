import * as Dialog from '@radix-ui/react-dialog';
import { ChatCircle, File, LinkSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import companion from '../companion.module.css';
import type { AgentSummary, TranscriptSearchResult } from '../types';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import primitives from '../styles/primitives.module.css';
import { AgentForm } from './AgentForm';
import { sidebarAgentOrder, sidebarThreadOrder } from '../shortcuts';

export interface QuickSwitcherAction {
  id: string;
  label: string;
  detail: string;
  keywords?: string | undefined;
  icon: ReactNode;
  /** The action opens a conversation, which then owns focus (its composer). */
  opensConversation?: boolean | undefined;
  run(): void;
}

interface QuickSwitcherProps {
  open: boolean;
  agents: AgentSummary[];
  selectedAgentId?: string | undefined;
  selectedThreadId?: string | undefined;
  actions: QuickSwitcherAction[];
  onOpenChange(open: boolean): void;
  onSelectAgent(agentId: string): void;
  onSelectThread(threadId: string, archived?: boolean): void;
  searchResources?(query: string): Promise<TranscriptSearchResult[]>;
}

type SwitcherEntry =
  | {
      kind: 'action';
      id: string;
      label: string;
      detail: string;
      icon: ReactNode;
      opensConversation?: boolean | undefined;
      run(): void;
    }
  | { kind: 'agent'; id: string; label: string; detail: string; hue: number; run(): void }
  | {
      kind: 'thread';
      id: string;
      label: string;
      detail: string;
      updatedAt: string;
      pinned: boolean;
      run(): void;
    }
  | {
      kind: 'resource';
      resourceKind: 'message' | 'file' | 'link' | 'thread';
      id: string;
      label: string;
      detail: string;
      run(): void;
    };

type ThreadSwitcherEntry = Extract<SwitcherEntry, { kind: 'thread' }>;

interface SwitcherSection {
  /** Shown above the section when the list is browsed rather than searched. */
  label?: string | undefined;
  entries: SwitcherEntry[];
}

export function QuickSwitcher({
  open,
  agents,
  selectedAgentId,
  selectedThreadId,
  actions,
  onOpenChange,
  onSelectAgent,
  onSelectThread,
  searchResources,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [resourceResults, setResourceResults] = useState<TranscriptSearchResult[]>([]);
  // Opening a conversation hands focus to its composer instead of the element behind ⌘K.
  const handedOffFocus = useRef(false);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2 || !searchResources) {
      setResourceResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchResources(normalized).then(
        (results) => active && setResourceResults(results),
        () => active && setResourceResults([]),
      );
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query, searchResources]);

  const sections = useMemo((): SwitcherSection[] => {
    const normalized = normalize(query);
    const actionEntries: SwitcherEntry[] = actions.map((action) => ({
      kind: 'action',
      id: `action-${action.id}`,
      label: action.label,
      detail: action.detail,
      icon: action.icon,
      opensConversation: action.opensConversation,
      run: action.run,
    }));
    const agentEntries: SwitcherEntry[] = agents.map((agent) => ({
      kind: 'agent',
      id: `agent-${agent.id}`,
      label: agent.name,
      detail: agent.id === selectedAgentId ? 'Current agent' : 'Agent',
      hue: agent.hue,
      run: () => onSelectAgent(agent.id),
    }));
    // Sidebar order, so equally good matches list as the sidebar does (pinned first).
    const threadEntries: ThreadSwitcherEntry[] = sidebarAgentOrder(agents).flatMap((agent) =>
      sidebarThreadOrder(agent.threads).map((thread) => ({
        kind: 'thread' as const,
        id: `thread-${thread.id}`,
        label: thread.title,
        detail: `${agent.name}${thread.id === selectedThreadId ? ' · open now' : ''}`,
        updatedAt: thread.updatedAt,
        pinned: Boolean(thread.pinned),
        run: () => onSelectThread(thread.id),
      })),
    );
    const listedThreadIds = new Set(threadEntries.map((entry) => entry.id));
    const resourceEntries: SwitcherEntry[] = resourceResults.flatMap((result) =>
      result.matches
        // A title-only hit duplicates the thread row that is already listed.
        .filter(
          (match) =>
            match.kind !== 'thread' || !listedThreadIds.has(`thread-${result.threadId}`),
        )
        .map((match) => ({
          kind: 'resource' as const,
          resourceKind: match.kind,
          id: `resource-${result.threadId}-${match.itemId}`,
          label: match.label ?? match.excerpt,
          detail: result.threadTitle,
          run: () => onSelectThread(result.threadId, result.archived),
        })),
    );

    if (!normalized) {
      const recent = threadEntries.toSorted((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
      return [
        { label: 'Quick actions', entries: actionEntries },
        { label: 'Pinned', entries: recent.filter(({ pinned }) => pinned).slice(0, 6) },
        {
          label: 'Recent conversations',
          entries: recent.filter(({ pinned }) => !pinned).slice(0, 6),
        },
        {
          label: 'Other agents',
          entries: agentEntries
            .filter((entry) => entry.id !== `agent-${selectedAgentId}`)
            .slice(0, 4),
        },
      ].filter((section) => section.entries.length);
    }

    // Equal scores keep this order, so conversation titles outrank message excerpts.
    return [
      {
        entries: [...threadEntries, ...resourceEntries, ...agentEntries, ...actionEntries]
          .map((entry) => ({ entry, score: matchScore(entry, normalized, actions) }))
          .filter((candidate) => candidate.score >= 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 14)
          .map(({ entry }) => entry),
      },
    ];
  }, [
    actions,
    agents,
    onSelectAgent,
    onSelectThread,
    query,
    resourceResults,
    selectedAgentId,
    selectedThreadId,
  ]);
  const entries = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const highlightQuery = normalize(query);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(0);
  }, [open]);

  useEffect(() => {
    setHighlighted((current) => Math.min(current, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  const highlightedId = entries[highlighted]?.id;
  useEffect(() => {
    if (!open || !highlightedId) return;
    document.getElementById(highlightedId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlightedId]);

  const activate = (entry: SwitcherEntry | undefined) => {
    if (!entry) return;
    handedOffFocus.current = entry.kind !== 'action' || Boolean(entry.opensConversation);
    onOpenChange(false);
    entry.run();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogs.dialogOverlay} />
        <Dialog.Content
          className={companion.quickSwitcher}
          onCloseAutoFocus={(event) => {
            if (handedOffFocus.current) event.preventDefault();
            handedOffFocus.current = false;
          }}
        >
          <Dialog.Title>Move through Sia</Dialog.Title>
          <Dialog.Description className={primitives.visuallyHidden}>
            Search conversations, agents, and common actions.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              className={`${buttons.iconButton} ${companion.quickSwitcherClose}`}
              aria-label="Close quick switcher"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </Dialog.Close>
          <label className={companion.quickSwitcherSearch}>
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-label="Search conversations and actions"
              aria-controls="quick-switcher-results"
              aria-expanded="true"
              aria-activedescendant={entries[highlighted]?.id}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setHighlighted((current) =>
                    entries.length ? (current + 1) % entries.length : 0,
                  );
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setHighlighted((current) =>
                    entries.length ? (current - 1 + entries.length) % entries.length : 0,
                  );
                } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  activate(entries[highlighted]);
                }
              }}
              placeholder="Search conversations and actions"
              spellCheck={false}
            />
            <kbd>⌘K</kbd>
          </label>
          <div
            id="quick-switcher-results"
            className={companion.quickSwitcherResults}
            role="listbox"
            aria-label="Sia destinations"
          >
            {sections.map((section) => {
              const rows = section.entries.map((entry) => {
                const index = entries.indexOf(entry);
                return (
                  <button
                    type="button"
                    role="option"
                    id={entry.id}
                    key={entry.id}
                    aria-selected={index === highlighted}
                    className={companion.quickSwitcherRow}
                    onPointerMove={() => setHighlighted(index)}
                    onClick={() => activate(entry)}
                  >
                    <span className={companion.quickSwitcherIcon} aria-hidden="true">
                      {entry.kind === 'agent' ? (
                        <AgentForm identity={entry.hue} size="small" />
                      ) : entry.kind === 'thread' ? (
                        <ChatCircle size={17} />
                      ) : entry.kind === 'resource' ? (
                        entry.resourceKind === 'file' ? (
                          <File size={17} />
                        ) : entry.resourceKind === 'link' ? (
                          <LinkSimple size={17} />
                        ) : (
                          <MagnifyingGlass size={17} />
                        )
                      ) : (
                        entry.icon
                      )}
                    </span>
                    <span>
                      <strong>
                        <Highlighted text={entry.label} query={highlightQuery} />
                      </strong>
                      {entry.detail ? <small>{entry.detail}</small> : null}
                    </span>
                    <span className={companion.quickSwitcherKind}>{kindLabel(entry)}</span>
                  </button>
                );
              });
              return section.label ? (
                <div
                  key={section.label}
                  role="group"
                  aria-label={section.label}
                  className={companion.quickSwitcherSection}
                >
                  <div className={companion.quickSwitcherHeading} aria-hidden="true">
                    {section.label}
                  </div>
                  {rows}
                </div>
              ) : (
                rows
              );
            })}
            {entries.length === 0 ? (
              <p className={companion.quickSwitcherEmpty}>
                No conversations, messages, or actions match.
              </p>
            ) : null}
          </div>
          <footer>
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchScore(entry: SwitcherEntry, query: string, actions: QuickSwitcherAction[]) {
  const action =
    entry.kind === 'action'
      ? actions.find((candidate) => `action-${candidate.id}` === entry.id)
      : undefined;
  const haystack = normalize(
    `${entry.label} ${entry.detail}${action?.keywords ? ` ${action.keywords}` : ''}`,
  );
  if (haystack === query) return 4;
  if (normalize(entry.label).startsWith(query)) return 3;
  if (haystack.includes(query)) return 2;
  const tokens = query.split(/\s+/u);
  return tokens.every((token) => haystack.includes(token)) ? 1 : -1;
}

function kindLabel(entry: SwitcherEntry) {
  if (entry.kind === 'thread') return 'Conversation';
  if (entry.kind === 'agent') return 'Agent';
  if (entry.kind === 'action') return 'Action';
  if (entry.resourceKind === 'thread') return 'Conversation';
  if (entry.resourceKind === 'file') return 'File';
  if (entry.resourceKind === 'link') return 'Link';
  return 'Message';
}

/** The label with the first stretch that matches the search softly marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const lower = text.toLocaleLowerCase();
  // Case folding that changes length (rare scripts) would misplace the mark; skip it then.
  const start = query && lower.length === text.length ? lower.indexOf(query) : -1;
  if (start < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + query.length)}</mark>
      {text.slice(start + query.length)}
    </>
  );
}
