import { SlidersHorizontal, X, WarningCircle } from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';
import { AgentDialog } from './components/AgentDialog';
import { AppSkeleton, WorkspaceNotice } from './components/AppStates';
import { Conversation } from './components/Conversation';
import { Inspector } from './components/Inspector';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ResearchConsentDialog } from './components/settings/ResearchConsentDialog';
import { SiaSignInDialog } from './components/settings/SiaSignInDialog';
import {
  ActivityDashboard,
  ArchivedThreadsSection,
  ThreadModelControls,
  TranscriptSearch,
  ThreadWorkspaceTools,
} from './components/localParity';
import type { AgentDraft, RendererApi } from './types';
import { useAppController } from './useAppController';
import { RESEARCH_CONSENT_VERSION } from '../shared/bridge';
import './tokens.css';
import styles from './ui.module.css';

const AuditGallery = lazy(() => import('./audit/AuditGallery'));

export interface AppProps {
  api?: RendererApi | undefined;
  forceAuditMode?: boolean | undefined;
}

export default function App({ api: suppliedApi, forceAuditMode }: AppProps) {
  const app = useAppController(suppliedApi);
  const auditMode =
    forceAuditMode ??
    Boolean(
      import.meta.env?.DEV && typeof location !== 'undefined' && location.hash === '#audit',
    );
  if (auditMode) {
    return (
      <Suspense fallback={<div className={styles.auditLoading}>Loading UI audit...</div>}>
        <AuditGallery />
      </Suspense>
    );
  }
  if (app.fatalError) {
    return (
      <div className={styles.fatalState} role="alert">
        <WarningCircle size={26} aria-hidden="true" />
        <h1>Sia needs to reconnect</h1>
        <p>{app.fatalError}</p>
        <button type="button" className={styles.primaryButton} onClick={app.retry}>
          Try again
        </button>
      </div>
    );
  }
  if (!app.snapshot) return <AppSkeleton />;

  const { api, snapshot, run } = app;
  const selectedAgent = snapshot.agents.find((agent) => agent.id === snapshot.selectedAgentId);
  const activeThread = snapshot.activeThread;
  // The room belongs to whoever owns the visible thread; otherwise to the selected agent.
  const roomAgent =
    (activeThread && snapshot.agents.find((agent) => agent.id === activeThread.agentId)) ??
    selectedAgent;

  return (
    <div className={styles.appShell}>
      <Sidebar
        agents={snapshot.agents}
        selectedAgentId={snapshot.selectedAgentId}
        selectedThreadId={snapshot.selectedThreadId}
        collapsed={app.sidebarCollapsed}
        onToggle={app.toggleSidebar}
        onSelectAgent={(agentId) => {
          app.closeSettings();
          app.closeActivity();
          void run(() => api.selectAgent(agentId));
        }}
        onSelectThread={(threadId) => {
          app.closeSettings();
          app.closeActivity();
          void run(() => api.selectThread(threadId));
        }}
        onCreateThread={(agentId) => {
          app.closeSettings();
          app.closeActivity();
          void run(() => api.createThread(agentId));
        }}
        onRenameThread={(threadId, title) =>
          app.attempt(() => api.renameThread(threadId, title)) as Promise<void>
        }
        onDeleteThread={(threadId) =>
          app.attempt(() => api.deleteThread(threadId)) as Promise<void>
        }
        onCleanupWorktree={(threadId) =>
          app.attempt(() => api.cleanupWorktree(threadId)) as Promise<void>
        }
        onForkThread={(threadId, isolated, title) =>
          app.attempt(() => api.forkThread(threadId, isolated, title)) as Promise<void>
        }
        onArchiveThread={(threadId) =>
          app.attempt(() => api.archiveThread(threadId)) as Promise<void>
        }
        onCreateAgent={app.openNewAgent}
        onEditAgent={app.openEditAgent}
        onOpenActivity={() => app.openActivity('activity')}
        onOpenArchived={() => app.openActivity('archived')}
        onOpenSettings={() => app.openSettings()}
      />

      <section className={styles.workspace} data-identity={roomAgent?.hue}>
        {!app.settingsOpen ? (
          <header className={styles.topbar}>
            <div className={styles.threadIdentity}>
              <strong>{activeThread?.title ?? selectedAgent?.name ?? 'Sia'}</strong>
            </div>
            <div className={styles.topbarActions}>
              {activeThread ? (
                <ThreadModelControls
                  modelId={activeThread.model}
                  reasoningId={activeThread.reasoningEffort ?? ''}
                  models={modelOptions(snapshot, activeThread.provider, activeThread.model)}
                  reasoningOptions={reasoningOptions(
                    snapshot,
                    activeThread.provider,
                    activeThread.model,
                    activeThread.reasoningEffort,
                  )}
                  disabled={activeThread.status !== 'idle' && activeThread.status !== 'error'}
                  onChangeModel={(model) =>
                    api.configureThread(
                      activeThread.id,
                      model,
                      defaultReasoning(snapshot, activeThread.provider, model),
                    )
                  }
                  onChangeReasoning={(reasoning) =>
                    api.configureThread(
                      activeThread.id,
                      activeThread.model,
                      reasoning || undefined,
                    )
                  }
                />
              ) : null}
              <button
                type="button"
                className={`${styles.inspectorButton} ${app.inspectorOpen ? styles.inspectorButtonActive : ''}`}
                onClick={app.toggleInspector}
                aria-pressed={app.inspectorOpen}
                aria-label="Access"
                title="Access"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Access</span>
              </button>
            </div>
          </header>
        ) : null}

        <WorkspaceNotice app={app} />
        <div className={styles.workspaceBody}>
          {app.activityOpen ? (
            <main className={styles.activityPage}>
              <header className={styles.activityPageHeader}>
                <div>
                  <h1>Activity</h1>
                  <p>Running work and threads that need your attention.</p>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={app.closeActivity}
                  aria-label="Close activity"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </header>
              <div className={styles.activityPageContent}>
                <TranscriptSearch
                  search={(query) => api.searchThreads(query)}
                  onOpen={(threadId, archived) => {
                    app.closeActivity();
                    void run(async () => {
                      if (archived) await api.unarchiveThread(threadId);
                      await api.selectThread(threadId);
                    });
                  }}
                />
                <ActivityDashboard
                  activities={activityItems(snapshot)}
                  onOpenThread={(threadId) => {
                    app.closeActivity();
                    void run(() => api.selectThread(threadId));
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
          ) : app.settingsOpen ? (
            <Settings
              key={app.settingsSection}
              snapshot={snapshot}
              initialSection={app.settingsSection}
              onClose={app.closeSettings}
              onProbeProvider={(provider) => api.refreshProvider(provider)}
              onConnectGoogleApps={() => api.connectGoogleApps()}
              onUpgradeGoogleApps={() => api.upgradeGoogleApps()}
              onConnectApp={(id) => api.connectApp(id)}
              onSetAppEnabled={(id, enabled) => api.setAppEnabled(id, enabled)}
              onDisconnectApp={(id, expectedConnectionId) =>
                api.disconnectApp(id, expectedConnectionId)
              }
              onStartCloudSignIn={(email) => api.startCloudSignIn(email)}
              onCompleteCloudSignIn={(code) => api.completeCloudSignIn(code)}
              onBeginAdminMfa={() => api.beginAdminMfa()}
              onCompleteAdminMfa={(code) => api.completeAdminMfa(code)}
              onSignOutCloud={() => api.signOutCloud()}
              onDeleteCloudAccount={(confirmation) => api.deleteCloudAccount(confirmation)}
              onAttachBrowser={(windowId) => api.attachBrowser(windowId)}
              onOpenBrowserSite={(url) => api.openBrowserSite(url)}
              onDetachBrowser={() => api.detachBrowser()}
              onRequestPermissions={() => api.requestComputerPermissions()}
              onSetComputerTrust={(trust) => api.setComputerTrust(trust)}
              onUnlockComputer={() => api.unlockComputer()}
              onSetTrajectoryLog={(enabled) => api.setTrajectoryLog(enabled)}
              onRevealTrajectories={() => api.revealTrajectories()}
              onOpenMessages={() => api.openMessages()}
              onConfigureVoice={(apiKey) => api.configureVoice(apiKey)}
              onRefreshVoices={() => api.refreshVoices()}
              onSelectVoice={(voiceId) => api.selectVoice(voiceId)}
              onDisconnectVoice={() => api.disconnectVoice()}
              onSetCompletionSound={(enabled) => api.setCompletionSound(enabled)}
              onSetCapturePaused={(paused) => api.setCapturePaused(paused)}
              onExport={() => api.exportResearchData()}
              onDelete={() => api.deleteResearchData()}
              onListResearchInvites={() => api.listResearchInvites()}
              onCreateResearchInvite={(email) => api.createResearchInvite(email)}
              onListResearchParticipants={() => api.listResearchParticipants()}
              onListResearchBatches={(subject) => api.listResearchBatches(subject)}
              onReadResearchBatch={(subject, batchId) =>
                api.readResearchBatch(subject, batchId)
              }
            />
          ) : (
            <Conversation
              thread={activeThread}
              agentName={roomAgent?.name}
              agentInitials={roomAgent?.initials}
              loading={app.loading}
              attachments={app.attachments}
              acceptingAttachments={Boolean(activeThread)}
              onPickAttachments={
                activeThread ? () => app.pickAttachments(activeThread.id) : undefined
              }
              onRemoveAttachment={app.removeAttachment}
              voiceEnabled={snapshot.voice.status === 'connected'}
              onTranscribeVoice={(audioBase64, mimeType) =>
                api.transcribeVoice(audioBase64, mimeType)
              }
              onStartRealtimeVoice={() => api.startRealtimeVoice()}
              onAppendRealtimeVoice={(sessionId, audioBase64) =>
                api.appendRealtimeVoice(sessionId, audioBase64)
              }
              onStopRealtimeVoice={(sessionId, commit) =>
                api.stopRealtimeVoice(sessionId, commit)
              }
              onSpeak={(text) => api.speakText(text, selectedAgent?.voiceId)}
              completionSound={snapshot.preferences.completionSound}
              onSend={(content, attachmentIds) =>
                activeThread
                  ? app
                      .attempt(() => api.sendMessage(activeThread.id, content, attachmentIds))
                      .then(app.clearAttachments)
                  : Promise.resolve()
              }
              onStop={() =>
                activeThread ? run(() => api.cancelTurn(activeThread.id)) : Promise.resolve()
              }
              onRetry={() =>
                activeThread ? run(() => api.retryThread(activeThread.id)) : Promise.resolve()
              }
              onResolveApproval={(id, decision) =>
                run(() => api.respondToApproval(id, decision))
              }
              onCreateThread={
                selectedAgent
                  ? () => void run(() => api.createThread(selectedAgent.id))
                  : undefined
              }
              onCreateAgent={!selectedAgent ? app.openNewAgent : undefined}
              onOpenApps={
                snapshot.cloudAuth.state === 'signed-in' &&
                snapshot.cloudAuth.features?.connectors !== false &&
                snapshot.apps.some(({ status }) => status !== 'connected')
                  ? () => app.openSettings('apps')
                  : undefined
              }
              workspaceTools={
                activeThread ? (
                  <>
                    {activeThread.sourceThreadId ? (
                      <div className={styles.forkSourceLabel} data-testid="fork-source-label">
                        Forked from {activeThread.sourceThreadId}
                      </div>
                    ) : null}
                    <ThreadWorkspaceTools
                      thread={activeThread}
                      snapshot={snapshot}
                      api={api}
                      run={run}
                    />
                  </>
                ) : undefined
              }
            />
          )}
          {app.inspectorOpen && !app.settingsOpen ? (
            <Inspector
              browser={snapshot.browser}
              computer={snapshot.computer}
              connection={snapshot.connection}
              cloudAuth={snapshot.cloudAuth}
              research={snapshot.research}
              onClose={app.closeInspector}
              onAttachBrowser={(windowId) => void run(() => api.attachBrowser(windowId))}
              onOpenBrowserSite={(url) => void run(() => api.openBrowserSite(url))}
              onDetachBrowser={() => void run(() => api.detachBrowser())}
              onRequestPermissions={() => void run(() => api.requestComputerPermissions())}
              onOpenCloudSettings={() => app.openSettings('apps')}
              onOpenResearchSettings={() => app.openSettings('privacy')}
              onToggleResearch={() =>
                void run(() => api.setCapturePaused(snapshot.research.capture !== 'paused'))
              }
            />
          ) : null}
        </div>
      </section>

      <AgentDialog
        open={app.agentDialogOpen}
        agent={app.editingAgent}
        providers={snapshot.providers}
        voice={snapshot.voice}
        onOpenChange={app.setAgentDialogOpen}
        onPickWorkspace={() => api.pickWorkspace()}
        onProbeProvider={(provider) => api.refreshProvider(provider)}
        onOpenCloudSettings={() => {
          app.setAgentDialogOpen(false);
          app.openSettings('apps');
        }}
        onSave={(draft: AgentDraft) =>
          (app.editingAgent
            ? app.attempt(() => api.updateAgent(app.editingAgent!.id, draft))
            : app.attempt(() => api.createAgent(draft))) as Promise<void>
        }
        {...(app.editingAgent
          ? {
              onDelete: () =>
                app.attempt(() => api.deleteAgent(app.editingAgent!.id)) as Promise<void>,
            }
          : {})}
      />
      {(snapshot.cloudAuth.state === 'signed-out' ||
        snapshot.cloudAuth.state === 'code-sent' ||
        snapshot.cloudAuth.state === 'password-required' ||
        snapshot.cloudAuth.state === 'mfa-required') &&
      snapshot.agents.length === 0 ? (
        <SiaSignInDialog
          cloudAuth={snapshot.cloudAuth}
          onStart={(email) => api.startCloudSignIn(email)}
          onComplete={(code) => api.completeCloudSignIn(code)}
          onBeginAdminMfa={() => api.beginAdminMfa()}
          onCompleteAdminMfa={(code) => api.completeAdminMfa(code)}
          onSignOut={() => api.signOutCloud()}
          onDelete={(confirmation) => api.deleteCloudAccount(confirmation)}
        />
      ) : null}
      {(snapshot.cloudAuth.state === 'signed-in' ||
        (snapshot.cloudAuth.state === 'unconfigured' && snapshot.agents.length > 0)) &&
      !snapshot.research.consented &&
      snapshot.research.promptReviewedVersion !== RESEARCH_CONSENT_VERSION ? (
        <ResearchConsentDialog
          autoOpen
          cloudAvailable={snapshot.cloudAuth.state !== 'unconfigured'}
          researchRequired={snapshot.cloudAuth.state === 'signed-in'}
          showTrigger={false}
          onAccept={() => api.setCapturePaused(false)}
          onDecline={async () => {
            await api.declineResearchConsent();
            if (snapshot.cloudAuth.state === 'signed-in') await api.signOutCloud();
          }}
        />
      ) : null}
    </div>
  );
}
function providerModels(snapshot: import('./types').RendererSnapshot, provider: string) {
  return snapshot.providers.find((candidate) => candidate.id === provider)?.models ?? [];
}

function modelOptions(
  snapshot: import('./types').RendererSnapshot,
  provider: string,
  selectedModel: string,
) {
  const models = providerModels(snapshot, provider);
  return models.length
    ? models.map((model) => ({ id: model.id, label: model.label, detail: model.description }))
    : [{ id: selectedModel, label: selectedModel }];
}

function reasoningOptions(
  snapshot: import('./types').RendererSnapshot,
  provider: string,
  modelId: string,
  selected?: string,
) {
  const efforts =
    providerModels(snapshot, provider).find((model) => model.id === modelId)
      ?.reasoningEfforts ?? [];
  const values = efforts.length ? efforts : selected ? [selected] : [''];
  return values.map((effort) => ({
    id: effort,
    label: effort ? effort[0]!.toUpperCase() + effort.slice(1) : 'Default',
  }));
}

function defaultReasoning(
  snapshot: import('./types').RendererSnapshot,
  provider: string,
  modelId: string,
) {
  return providerModels(snapshot, provider).find((model) => model.id === modelId)
    ?.defaultReasoningEffort;
}

function activityItems(snapshot: import('./types').RendererSnapshot) {
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
            : thread.status === 'waiting'
              ? 'Waiting for your input'
              : thread.unread
                ? 'New activity is ready to review'
                : 'The last turn stopped'),
        agentName: agent.name,
        status: thread.unread
          ? ('unread' as const)
          : thread.status === 'running'
            ? ('running' as const)
            : thread.status === 'waiting' || thread.status === 'queued'
              ? ('waiting' as const)
              : thread.status === 'error'
                ? ('failed' as const)
                : ('background' as const),
        updatedAt: thread.updatedAt,
      })),
  );
}
