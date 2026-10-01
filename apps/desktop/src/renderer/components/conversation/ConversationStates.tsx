import layout from '../../styles/layout.module.css';
import buttons from '../../styles/buttons.module.css';
import type { ThreadSummary } from '../../types';
import { timeGreeting } from '../../welcome';
import styles from '../Conversation.module.css';
import { AgentForm } from '../AgentForm';
import { WelcomeRecents } from '../WelcomeRecents';
import { DitherAurora as Aurora } from '../effects/DitherAurora';
import { LiquidMetalButton } from '../effects/liquid-metal-button';

interface ConversationWelcomeProps {
  agentName?: string | undefined;
  agentHue?: number | undefined;
  recentThreads: readonly ThreadSummary[];
  onOpenThread?: ((id: string) => void) | undefined;
  onCreateThread?: (() => void) | undefined;
  onCreateAgent?: (() => void) | undefined;
  onOpenApps?: (() => void) | undefined;
}

/** No conversation open: greet the agent, or invite the person to create their first one. */
export function ConversationWelcome({
  agentName,
  agentHue,
  recentThreads,
  onOpenThread,
  onCreateThread,
  onCreateAgent,
  onOpenApps,
}: ConversationWelcomeProps) {
  return (
    <main className={layout.mainPane} data-companion-conversation data-scene="welcome">
      <Aurora className={layout.conversationAurora} pauseWhenUnfocused />
      <div className={styles.emptyState} data-companion-empty>
        <AgentForm identity={agentHue ?? 0} size="large" />
        <span className={styles.emptyStateKicker}>
          {agentName ? `${timeGreeting()} · ${agentName} is ready` : 'Start here'}
        </span>
        <h1 className={layout.gradientHeading}>
          {agentName ? `Start a conversation with ${agentName}.` : 'Create your first agent.'}
        </h1>
        <p>
          {agentName
            ? recentThreads.length
              ? 'Pick up a recent conversation, or start with something you want off your list.'
              : 'Start with something you want off your list.'
            : 'Give it a name and one short instruction. Sia chooses a model, color, and private folder.'}
        </p>
        {onCreateThread ? (
          <LiquidMetalButton tone="sage" onClick={onCreateThread}>
            New conversation
          </LiquidMetalButton>
        ) : onCreateAgent ? (
          <LiquidMetalButton tone="sage" onClick={onCreateAgent}>
            Create your first agent
          </LiquidMetalButton>
        ) : null}
        {onOpenApps ? (
          <button
            className={`${buttons.textButton} ${styles.emptyStateLink}`}
            type="button"
            onClick={onOpenApps}
          >
            Connect work apps later
          </button>
        ) : null}
        <WelcomeRecents threads={recentThreads} onOpen={onOpenThread} />
      </div>
    </main>
  );
}

export function ConversationSkeleton() {
  return (
    <main className={layout.mainPane} aria-label="Loading conversation" aria-busy="true">
      <div className={styles.threadScroll}>
        <div className={styles.conversationColumn}>
          <div className={styles.skeletonMessage} />
          <div className={`${styles.skeletonMessage} ${styles.skeletonShort}`} />
          <div className={styles.skeletonActivity} />
          <div className={styles.skeletonMessage} />
        </div>
      </div>
      <div className={styles.skeletonComposer} />
    </main>
  );
}
