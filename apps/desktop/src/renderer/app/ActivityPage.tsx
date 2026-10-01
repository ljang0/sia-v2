import { X } from '@phosphor-icons/react';
import {
  ActivityDashboard,
  ArchivedThreadsSection,
  TranscriptSearch,
} from '../components/localParity';
import type { RendererSnapshot } from '../types';
import type { useAppController } from '../useAppController';
import layout from '../styles/layout.module.css';
import buttons from '../styles/buttons.module.css';
import styles from '../App.module.css';

interface ActivityPageProps {
  app: ReturnType<typeof useAppController>;
  snapshot: RendererSnapshot;
}

/** Activity: running and unread work, search across conversations, and archived ones. */
export function ActivityPage({ app, snapshot }: ActivityPageProps) {
  const { api, run } = app;
  return (
    <main className={layout.activityPage}>
      <header className={layout.activityPageHeader}>
        <div>
          <h1>Activity</h1>
          <p>What your agents are doing, and anything waiting for you.</p>
        </div>
        <button
          type="button"
          className={buttons.iconButton}
          onClick={app.closeActivity}
          aria-label="Close activity"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.activityPageContent}>
        <ActivityDashboard
          activities={activityItems(snapshot)}
          onOpenThread={(threadId) => {
            app.closeActivity();
            void run(() => api.selectThread(threadId));
          }}
        />
        <TranscriptSearch
          focusOnMount={app.activityTarget === 'search'}
          search={(query) => api.searchThreads(query)}
          onOpen={(threadId, archived) => {
            app.closeActivity();
            void run(async () => {
              if (archived) await api.unarchiveThread(threadId);
              await api.selectThread(threadId);
            });
          }}
        />
        <ArchivedThreadsSection
          focusOnMount={app.activityTarget === 'archived'}
          threads={snapshot.archivedThreads.map((thread) => ({
            id: thread.id,
            title: thread.title,
            agentName:
              snapshot.agents.find((agent) => agent.id === thread.agentId)?.name ??
              'Unknown agent',
            archivedAt: thread.archivedAt ?? thread.updatedAt,
          }))}
          onOpen={(threadId) => {
            app.closeActivity();
            void run(() => api.selectThread(threadId));
          }}
          onRestore={(threadId) => run(() => api.unarchiveThread(threadId))}
        />
      </div>
    </main>
  );
}

function activityItems(snapshot: RendererSnapshot) {
  return snapshot.agents.flatMap((agent) =>
    agent.threads
      .filter((thread) => thread.status !== 'idle' || thread.unread)
      .map((thread) => ({
        id: `activity-${thread.id}`,
        threadId: thread.id,
        title: thread.title,
        detail:
          thread.queueReason ??
          (thread.status === 'running'
            ? 'Working in the background'
            : thread.status === 'queued'
              ? 'Queued'
              : thread.status === 'waiting'
                ? 'Waiting for your input'
                : thread.status === 'error'
                  ? 'Stopped before it finished'
                  : 'New activity is ready to review'),
        agentName: agent.name,
        // Live state outranks the unread flag: a running thread that has unread output is running.
        status:
          thread.status === 'running'
            ? ('running' as const)
            : thread.status === 'queued'
              ? ('queued' as const)
              : thread.status === 'waiting'
                ? ('waiting' as const)
                : thread.status === 'error'
                  ? ('failed' as const)
                  : thread.unread
                    ? ('unread' as const)
                    : ('background' as const),
        updatedAt: thread.updatedAt,
      })),
  );
}
