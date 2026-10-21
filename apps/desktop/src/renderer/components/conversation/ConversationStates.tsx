import layout from '../../styles/layout.module.css';
import buttons from '../../styles/buttons.module.css';
import type { ThreadSummary } from '../../types';
import { timeGreeting } from '../../welcome';
import primitives from '../../styles/primitives.module.css';
import styles from '../Conversation.module.css';
import { AgentForm } from '../AgentForm';
import { WelcomeRecents } from '../WelcomeRecents';
import { DitherAurora as Aurora } from '../effects/DitherAurora';
import { ActionButton } from '../ActionButton';

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
            : 'Give it a name and say what it should help with. Sia sets up the rest.'}
        </p>
        {onCreateThread ? (
          <ActionButton tone="accent" onClick={onCreateThread}>
            New conversation
          </ActionButton>
        ) : onCreateAgent ? (
          <ActionButton tone="accent" onClick={onCreateAgent}>
            Create your first agent
          </ActionButton>
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
          <div className={`${primitives.skeleton} ${styles.skeletonMessage}`} />
          <div
            className={`${primitives.skeleton} ${styles.skeletonMessage} ${styles.skeletonShort}`}
          />
          <div className={`${primitives.skeleton} ${styles.skeletonActivity}`} />
          <div className={`${primitives.skeleton} ${styles.skeletonMessage}`} />
        </div>
      </div>
      <div className={`${primitives.skeleton} ${styles.skeletonComposer}`} />
    </main>
  );
}
