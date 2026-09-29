import {
  ArrowUpRight,
  Bug,
  ChatsCircle,
  Code,
  Compass,
  EnvelopeSimple,
  FileText,
  FolderSimple,
  Globe,
  type Icon,
  ListChecks,
  MagnifyingGlass,
  MoonStars,
  Notebook,
  PencilSimpleLine,
  Plugs,
  Scales,
  Sun,
} from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import type { ThreadSummary } from '../types';
import styles from '../ui.module.css';
import { timeGreeting, type WelcomeIcon, type WelcomePrompt } from '../welcome';
import { AgentForm } from './AgentForm';
import { WelcomeRecents } from './WelcomeRecents';
import home from './welcome-home.module.css';

const ICONS: Record<WelcomeIcon, Icon> = {
  sun: Sun,
  list: ListChecks,
  moon: MoonStars,
  mail: EnvelopeSimple,
  chats: ChatsCircle,
  doc: FileText,
  globe: Globe,
  folder: FolderSimple,
  pencil: PencilSimpleLine,
  scales: Scales,
  notebook: Notebook,
  search: MagnifyingGlass,
  code: Code,
  compass: Compass,
  bug: Bug,
};

/** The first thing people see in a new conversation: a greeting, suggestions, and recent work. */
export function WelcomeHome({
  agentName,
  agentHue,
  prompts,
  recentThreads,
  onSend,
  onOpenThread,
  onOpenApps,
}: {
  agentName?: string | undefined;
  agentHue?: number | undefined;
  prompts: readonly WelcomePrompt[];
  recentThreads: readonly ThreadSummary[];
  onSend(prompt: string): void;
  onOpenThread?: ((id: string) => void) | undefined;
  onOpenApps?: (() => void) | undefined;
}) {
  // Each block rises in after the one before it; --step orders them.
  const step = (index: number) => ({ '--step': index }) as CSSProperties;
  return (
    <div className={home.home} data-companion-thread-empty data-identity={agentHue ?? 0}>
      <div className={home.kicker} style={step(0)}>
        <AgentForm identity={agentHue} size="small" />
        <span>
          {timeGreeting()}
          {agentName ? ` · ${agentName} is ready` : ''}
        </span>
      </div>
      <h2 className={`${styles.gradientHeading} ${home.heading}`} style={step(1)}>
        What would you like to do?
      </h2>
      <p className={home.lede} style={step(2)}>
        Describe what you want done, or start from a suggestion.
      </p>
      {prompts.length ? (
        <div className={home.suggestions} role="group" aria-label="Suggested starts">
          {prompts.map((prompt, index) => {
            const PromptIcon = ICONS[prompt.icon];
            return (
              <button
                key={prompt.prompt}
                type="button"
                className={home.suggestion}
                style={step(3 + index)}
                onClick={() => onSend(prompt.prompt)}
              >
                <span className={home.suggestionIcon} aria-hidden="true">
                  <PromptIcon size={17} weight="duotone" />
                </span>
                <span className={home.suggestionCopy}>
                  <strong>{prompt.title}</strong>
                  <span>{prompt.prompt}</span>
                </span>
                <ArrowUpRight className={home.suggestionArrow} size={14} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
      {onOpenApps ? (
        <button
          className={home.connect}
          type="button"
          onClick={onOpenApps}
          style={step(3 + prompts.length)}
        >
          <Plugs size={15} aria-hidden="true" />
          Connect work apps
          <span aria-hidden="true">for suggestions from your mail, files, and chats</span>
        </button>
      ) : null}
      <div className={home.recents} style={step(4 + prompts.length)}>
        <WelcomeRecents threads={recentThreads} onOpen={onOpenThread} />
      </div>
    </div>
  );
}
