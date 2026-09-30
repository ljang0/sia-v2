import { Plugs } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import type { ThreadSummary } from '../types';
import styles from '../ui.module.css';
import { timeGreeting, type StarterPrompt } from '../welcome';
import { AgentForm } from './AgentForm';
import { StarterPrompts } from './StarterPrompts';
import { WelcomeRecents } from './WelcomeRecents';
import home from './welcome-home.module.css';

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
  prompts: readonly StarterPrompt[];
  recentThreads: readonly ThreadSummary[];
  onSend(prompt: string): void;
  onOpenThread?: ((id: string) => void) | undefined;
  onOpenApps?: (() => void) | undefined;
}) {
  // Each block rises in after the one before it; --step orders them.
  const step = (index: number) => ({ '--step': index }) as CSSProperties;
  return (
    <div className={home.home} data-companion-thread-empty>
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
        <div className={home.suggestions} style={step(3)}>
          <StarterPrompts prompts={prompts} onSend={onSend} />
        </div>
      ) : null}
      {onOpenApps ? (
        <button className={home.connect} type="button" onClick={onOpenApps} style={step(4)}>
          <Plugs size={15} aria-hidden="true" />
          Connect work apps
          <span aria-hidden="true">for suggestions from your mail, files, and chats</span>
        </button>
      ) : null}
      <div className={home.recents} style={step(5)}>
        <WelcomeRecents threads={recentThreads} onOpen={onOpenThread} />
      </div>
    </div>
  );
}
