import { BrowserTaskRecovery, browserTaskRequest } from './components/BrowserTaskRecovery';
import { SlidersHorizontal, WarningCircle } from '@phosphor-icons/react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Onboarding, onboardingStep } from './components/Onboarding';
import { AgentDialog } from './components/AgentDialog';
import { WorkspaceNotice } from './components/AppStates';
import { StartupTransition } from './components/StartupTransition';
import { Conversation } from './components/Conversation';
import { FeedbackDialog } from './components/FeedbackDialog';
import { replyFeedbackDraft } from './components/ReplyFeedback';
import { Inspector } from './components/Inspector';
import { RoomHeader } from './components/RoomHeader';
import { QuickSwitcher } from './components/QuickSwitcher';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { useReadOnScreen, useWindowVisible } from './readOnScreen';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { AppearanceContext } from './components/effects/appearance';
import { SiaSignInDialog } from './components/settings/SiaSignInDialog';
import {
  ScheduledPage,
  ThreadModelControls,
  ThreadWorkspaceTools,
} from './components/localParity';
import type { AgentDraft, RendererApi, RendererSnapshot } from './types';
import { useAppController } from './useAppController';
import { executionLabel } from './agentModels';
import { cancelComposerFocus, focusComposer } from './composerFocus';
import { heldAsQueued, OfflineBanner, useOfflineOutbox, useOnline } from './offline';
import { recentThreads, welcomePrompts } from './welcome';
import {
  useInstantThemeSwitch,
  useViewTransition,
} from './components/effects/use-view-transition';
import './tokens.css';
import companion from './companion.module.css';
import layout from './styles/layout.module.css';
import buttons from './styles/buttons.module.css';
import errorBoundary from './components/ErrorBoundary.module.css';
import styles from './App.module.css';
import { useTextSize } from './textSize';
import { ActivityPage } from './app/ActivityPage';
import { quickSwitcherActions as buildQuickSwitcherActions } from './app/quickSwitcherActions';
import { defaultReasoning, modelOptions, reasoningOptions } from './app/threadModelOptions';
import { useAppShortcuts } from './app/useAppShortcuts';

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
  const workspace = useRef<HTMLElement>(null);
  const viewSurface = useRef<HTMLDivElement>(null);
  const viewKey = app.settingsOpen
    ? `settings:${app.settingsSection}`
    : app.activityOpen
      ? app.activityTarget === 'scheduled'
        ? 'scheduled'
        : 'activity'
      : `thread:${app.snapshot?.selectedThreadId ?? ''}`;
  useViewTransition(
    viewSurface,
    viewKey,
    app.snapshot?.preferences.appearance === 'calm',
    workspace,
  );
  useInstantThemeSwitch();
  useTextSize(app.snapshot?.preferences.textSize);
  const windowVisible = useWindowVisible();
  const markRead = useCallback(
    (threadId: string) => void app.api.setThreadUnread(threadId, false).catch(() => undefined),
    [app.api],
  );
  useReadOnScreen(
    app.snapshot?.activeThread,
    windowVisible && viewKey.startsWith('thread:'),
    markRead,
  );
  const [reveal, setReveal] = useState(0);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<string>();
  const [conversationFindOpen, setConversationFindOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const online = useOnline();
  // A focus retry must not outlive the app it was aiming at.
  useEffect(() => cancelComposerFocus, []);
  const outbox = useOfflineOutbox(online, (message) =>
    app.attempt(() =>
      app.api.sendMessage(
        message.threadId,
        message.content,
        message.attachments.map(({ id }) => id),
      ),
    ),
  );
  const signInRequired =
    app.snapshot !== undefined && requiresSiaSignIn(app.snapshot.cloudAuth.state);

  useAppShortcuts({
    app,
    auditMode,
    signInRequired,
    conversationFindOpen,
    setQuickSwitcherOpen,
    setShortcutsOpen,
    setConversationFindOpen,
  });
  useEffect(
    () =>
      app.api.onOpenConversation?.(() => {
        app.closeSettings();
        app.closeActivity();
        setQuickSwitcherOpen(false);
        setConversationFindOpen(false);
        setReveal((current) => current + 1);
        focusComposer();
      }),
    [app],
  );
  useLayoutEffect(() => {
    if (
      !reveal ||
      app.snapshot?.preferences.appearance === 'calm' ||
      typeof matchMedia !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const animation = workspace.current?.animate?.(
      [
        { opacity: 0, transform: 'translateY(8px) scale(.995)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    return () => animation?.cancel();
  }, [reveal, app.snapshot?.preferences.appearance]);
  if (auditMode) {
    return (
      <Suspense fallback={<div className={styles.auditLoading}>Loading UI audit…</div>}>
        <AuditGallery />
      </Suspense>
    );
  }
  if (app.fatalError) {
    return (
      <div className={errorBoundary.fatalState} role="alert">
        <WarningCircle size={26} aria-hidden="true" />
        <h1>Sia needs to reconnect</h1>
        <p>{app.fatalError}</p>
        <button
          type="button"
          className={`${buttons.primaryButton} ${errorBoundary.fatalAction}`}
          onClick={app.retry}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!app.snapshot) return <StartupTransition ready={false} />;
  if (requiresSiaSignIn(app.snapshot.cloudAuth.state)) {
    return (
      <StartupTransition ready appearance={app.snapshot.preferences.appearance}>
        <SiaSignInDialog
          cloudAuth={app.snapshot.cloudAuth}
          onStart={(email) => app.api.startCloudSignIn(email)}
          onComplete={(code) => app.api.completeCloudSignIn(code)}
          onBeginAdminMfa={() => app.api.beginAdminMfa()}
          onCompleteAdminMfa={(code) => app.api.completeAdminMfa(code)}
          onSignOut={() => app.api.signOutCloud()}
          onDelete={(confirmation) => app.api.deleteCloudAccount(confirmation)}
        />
      </StartupTransition>
    );
  }

  const { api, snapshot, run } = app;
  const selectedAgent = snapshot.agents.find((agent) => agent.id === snapshot.selectedAgentId);
  const activeThread = snapshot.activeThread;
  // The room belongs to whoever owns the visible thread; otherwise to the selected agent.
  const roomAgent =
    (activeThread && snapshot.agents.find((agent) => agent.id === activeThread.agentId)) ??
    selectedAgent;
  const quickSwitcherActions = buildQuickSwitcherActions({
    app,
    selectedAgent,
    openShortcuts: () => setShortcutsOpen(true),
    openFeedback: () => setFeedbackOpen(true),
  });

  const content = (
    <div
      data-appearance={snapshot.preferences.appearance ?? 'expressive'}
      className={`${layout.appShell} ${companion.companionShell}`}
    >
      <Sidebar
        agents={snapshot.agents}
        selectedAgentId={snapshot.selectedAgentId}
        selectedThreadId={snapshot.selectedThreadId}
        activePage={
          app.settingsOpen
            ? 'settings'
            : app.activityOpen
              ? app.activityTarget === 'scheduled'
                ? 'scheduled'
                : 'activity'
              : 'conversation'
        }
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
          void run(() => api.createThread(agentId)).then(() => focusComposer());
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
        worktreeForks={snapshot.preferences.developerTools === true}
        onArchiveThread={(threadId) => app.archiveThread(threadId).then(() => focusComposer())}
        onCreateAgent={app.openNewAgent}
        onEditAgent={app.openEditAgent}
        onSetAgentPinned={(agentId, pinned) =>
          app.attempt(() => api.setAgentPinned(agentId, pinned)) as Promise<void>
        }
        onSetAgentNotifications={(agentId, enabled) =>
          app.attempt(() => api.setAgentNotifications(agentId, enabled)) as Promise<void>
        }
        onDuplicateAgent={(agentId) =>
          app.attempt(() => api.duplicateAgent(agentId)) as Promise<void>
        }
        onSetThreadUnread={(threadId, unread) =>
          app.attempt(() => api.setThreadUnread(threadId, unread)) as Promise<void>
        }
        onSetThreadPinned={(threadId, pinned) =>
          app.attempt(() => api.setThreadPinned(threadId, pinned)) as Promise<void>
        }
        onOpenActivity={() => app.openActivity('activity')}
        onOpenScheduled={
          snapshot.cloudAuth.features?.schedules === false
            ? undefined
            : () => app.openActivity('scheduled')
        }
        onOpenSettings={() => app.openSettings()}
        onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
      />

      <QuickSwitcher
        open={quickSwitcherOpen}
        agents={snapshot.agents}
        selectedAgentId={snapshot.selectedAgentId}
        selectedThreadId={snapshot.selectedThreadId}
        actions={quickSwitcherActions}
        onOpenChange={setQuickSwitcherOpen}
        onSelectAgent={(agentId) => {
          app.closeSettings();
          app.closeActivity();
          void run(() => api.selectAgent(agentId)).then(() => focusComposer());
        }}
        onSelectThread={(threadId, archived) => {
          app.closeSettings();
          app.closeActivity();
          void run(async () => {
            if (archived) await api.unarchiveThread(threadId);
            await api.selectThread(threadId);
          }).then(() => focusComposer());
        }}
        searchResources={(query) => api.searchThreads(query)}
      />
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <section
        ref={workspace}
        className={styles.workspace}
        data-identity={roomAgent?.hue}
        data-companion-workspace
      >
        {/* Settings and Activity are full pages with their own titles. */}
        {!app.settingsOpen && !app.activityOpen ? (
          <RoomHeader
            agent={roomAgent}
            thread={activeThread}
            setup={Boolean(onboardingStep(snapshot))}
            controls={
              <div className={styles.topbarActions}>
                {activeThread ? (
                  <ThreadModelControls
                    // The folder path is a developer detail.
                    workspace={
                      snapshot.preferences.developerTools === true
                        ? activeThread.workspace
                        : undefined
                    }
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
                    onChangeReasoning={(reasoning, model) =>
                      api.configureThread(activeThread.id, model, reasoning || undefined)
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
            }
          />
        ) : null}

        {online ? null : <OfflineBanner />}
        <WorkspaceNotice app={app} deviceOffline={!online} />
        <div className={styles.workspaceBody} ref={viewSurface} data-workspace-view={viewKey}>
          {app.activityOpen && app.activityTarget === 'scheduled' ? (
            <ScheduledPage
              snapshot={snapshot}
              api={api}
              run={run}
              attempt={app.attempt}
              onClose={app.closeActivity}
              onOpenThread={(threadId, archived) => {
                app.closeActivity();
                void run(async () => {
                  if (archived) await api.unarchiveThread(threadId);
                  await api.selectThread(threadId);
                });
              }}
            />
          ) : app.activityOpen ? (
            <ActivityPage app={app} snapshot={snapshot} />
          ) : app.settingsOpen ? (
            <Settings
              assistantApi={api}
              scottyApi={api.scotty}
              phoneRemoteApi={api.phoneRemote}
              onRunWorkflow={(threadId) => {
                app.closeSettings();
                void run(() => api.selectThread(threadId));
              }}
              key={app.settingsSection}
              snapshot={snapshot}
              initialSection={app.settingsSection}
              onClose={app.closeSettings}
              onOpenFeedback={() => setFeedbackOpen(true)}
              onProbeProvider={(provider) => api.refreshProvider(provider)}
              onOpenProviderSetup={(provider) => api.openProviderSetup(provider)}
              onCancelProviderSetup={(provider) => api.cancelProviderSetup(provider)}
              onSaveApiKey={(input) => api.saveApiKey(input)}
              onClearApiKey={() => api.clearApiKey()}
              onCheckForUpdates={() => api.checkForUpdates()}
              onOpenUpdateDownload={() => api.openUpdateDownload()}
              onConnectSelectedApps={(apps) => api.connectSelectedApps(apps)}
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
              onDetachBrowser={() => api.detachBrowser()}
              macSetupApi={api}
              onSetComputerAccessMode={(mode, background, backgroundFallback) =>
                api.setComputerAccessMode(mode, background, backgroundFallback)
              }
              onSetComputerTrust={(trust) => api.setComputerTrust(trust)}
              onSetTrajectoryLog={(enabled) => api.setTrajectoryLog(enabled)}
              onRevealTrajectories={() => api.revealTrajectories()}
              onOpenMessages={() => api.openMessages()}
              onConfigureVoice={() => api.configureVoice()}
              onRefreshVoices={() => api.refreshVoices()}
              onSelectVoice={(voiceId) => api.selectVoice(voiceId)}
              onDisconnectVoice={() => api.disconnectVoice()}
              onConfigurePushToTalk={(enabled, agentId, speakReplies) =>
                api.configurePushToTalk(enabled, agentId, undefined, speakReplies)
              }
              onStartSetup={() =>
                void run(async () => {
                  await api.setOnboarding('welcome');
                  app.closeSettings();
                  app.closeActivity();
                })
              }
              onSetAppearance={(appearance) => api.setAppearance(appearance)}
              onSetTheme={(theme) => api.setTheme(theme)}
              onSetTextSize={(textSize) => api.setTextSize(textSize)}
              onSetCompletionSound={(enabled) => api.setCompletionSound(enabled)}
              onSetOpenAtLogin={(enabled) => api.setOpenAtLogin(enabled)}
              onSetDeveloperTools={(enabled) => api.setDeveloperTools(enabled)}
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
            <Onboarding
              snapshot={snapshot}
              api={api}
              onCustomize={app.openNewAgent}
              onModels={() => app.openSettings('providers')}
              onAccount={() => app.openSettings('apps')}
            >
              <Conversation
                thread={
                  activeThread && outbox.held.length
                    ? {
                        ...activeThread,
                        queuedMessages: [
                          ...(activeThread.queuedMessages ?? []),
                          ...heldAsQueued(outbox.held, activeThread.id),
                        ],
                      }
                    : activeThread
                }
                executionLabel={
                  activeThread
                    ? executionLabel(
                        snapshot.providers,
                        activeThread.provider,
                        activeThread.model,
                      )
                    : undefined
                }
                agentName={roomAgent?.name}
                agentInitials={roomAgent?.initials}
                agentHue={roomAgent?.hue}
                loading={app.loading}
                attachments={app.attachments}
                acceptingAttachments={Boolean(activeThread)}
                onPickAttachments={
                  activeThread ? () => app.pickAttachments(activeThread.id) : undefined
                }
                onRemoveAttachment={app.removeAttachment}
                onDropAttachments={
                  activeThread
                    ? (files) => app.dropAttachments(activeThread.id, files)
                    : undefined
                }
                onPasteAttachments={
                  activeThread
                    ? (files) => app.run(() => app.pasteAttachments(activeThread.id, files))
                    : undefined
                }
                onPreviewAttachment={
                  activeThread
                    ? (attachmentId) => api.previewAttachment(activeThread.id, attachmentId)
                    : undefined
                }
                onOpenAttachment={
                  activeThread
                    ? (attachmentId) =>
                        app.run(() => api.openAttachment(activeThread.id, attachmentId))
                    : undefined
                }
                onRevealAttachment={
                  activeThread
                    ? (attachmentId) =>
                        app.run(() => api.revealAttachment(activeThread.id, attachmentId))
                    : undefined
                }
                starterPrompts={welcomePrompts(roomAgent, {
                  apps: snapshot.apps,
                  macAccess:
                    snapshot.computer.accessMode !== 'connected' &&
                    snapshot.computer.accessibility === 'allowed' &&
                    snapshot.computer.screenRecording === 'allowed',
                })}
                recentThreads={
                  activeThread?.events.length
                    ? []
                    : recentThreads(roomAgent?.threads ?? [], activeThread?.id)
                }
                onOpenThread={(id) => void run(() => api.selectThread(id))}
                findOpen={conversationFindOpen}
                onFindOpenChange={setConversationFindOpen}
                voiceEnabled={snapshot.voice.status === 'connected'}
                realtimeDictation={snapshot.voice.engine === 'macos'}
                dictationEnabled={snapshot.voice.dictationAvailable !== false}
                globalVoiceActive={Boolean(
                  snapshot.voice.pushToTalk &&
                  ['starting', 'listening', 'transcribing'].includes(
                    snapshot.voice.pushToTalk.phase,
                  ),
                )}
                onAcquireVoiceCapture={() => api.acquireVoiceCapture()}
                onReleaseVoiceCapture={(leaseId) => api.releaseVoiceCapture(leaseId)}
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
                onSend={(content, attachmentIds) => {
                  if (!activeThread) return Promise.resolve();
                  // Offline, or behind messages still waiting to go: hold it and send in order.
                  if (
                    !online ||
                    outbox.held.some(({ threadId }) => threadId === activeThread.id)
                  ) {
                    outbox.hold({
                      threadId: activeThread.id,
                      content,
                      attachments: (app.attachments ?? []).filter(({ id }) =>
                        attachmentIds?.includes(id),
                      ),
                    });
                    app.clearAttachments();
                    return Promise.resolve();
                  }
                  return app
                    .attempt(() => api.sendMessage(activeThread.id, content, attachmentIds))
                    .then(app.clearAttachments);
                }}
                onStop={() =>
                  activeThread
                    ? run(() => api.cancelTurn(activeThread.id)).then(() => focusComposer())
                    : Promise.resolve()
                }
                onRemoveQueued={(messageId) =>
                  outbox.isHeld(messageId)
                    ? Promise.resolve(outbox.remove(messageId)).then(() => focusComposer())
                    : activeThread
                      ? run(() => api.removeQueuedMessage(activeThread.id, messageId)).then(
                          () => focusComposer(),
                        )
                      : Promise.resolve()
                }
                onSendQueuedNow={
                  activeThread &&
                  online &&
                  !outbox.held.some(({ threadId }) => threadId === activeThread.id)
                    ? (messageId) =>
                        run(() => api.steerQueuedMessage(activeThread.id, messageId))
                    : undefined
                }
                browserRecovery={
                  snapshot.activeThread ? (
                    <BrowserTaskRecovery
                      accessMode={snapshot.computer.accessMode}
                      key={`${snapshot.activeThread.id}:${browserTaskRequest(snapshot.activeThread) ?? ''}`}
                      thread={snapshot.activeThread}
                      browser={snapshot.browser}
                      connect={(threadId, userMessageId, windowId) =>
                        api.connectBrowserAndContinue(threadId, userMessageId, windowId)
                      }
                    />
                  ) : undefined
                }
                onRetry={() =>
                  activeThread ? run(() => api.retryThread(activeThread.id)) : Promise.resolve()
                }
                onRedo={
                  activeThread && online
                    ? (text) => run(() => api.redoLastMessage(activeThread.id, text))
                    : undefined
                }
                onRateReply={(rating, reply) => {
                  setFeedbackDraft(replyFeedbackDraft(rating, reply));
                  setFeedbackOpen(true);
                }}
                onResolveApproval={(id, decision) =>
                  run(() => api.respondToApproval(id, decision)).then(() => focusComposer())
                }
                turnChanges={
                  activeThread
                    ? {
                        read: (eventId) => api.readTurnChanges(activeThread.id, eventId),
                        apply: (eventId, direction) =>
                          api.applyTurnChanges(activeThread.id, eventId, direction),
                      }
                    : undefined
                }
                onDraftChange={
                  activeThread
                    ? (content) => api.saveDraft(activeThread.id, content)
                    : undefined
                }
                onCreateThread={
                  selectedAgent
                    ? () =>
                        void run(() => api.createThread(selectedAgent.id)).then(() =>
                          focusComposer(),
                        )
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
                          Copied from{' '}
                          {snapshot.agents
                            .flatMap(({ threads }) => threads)
                            .find(({ id }) => id === activeThread.sourceThreadId)?.title ??
                            'another conversation'}
                        </div>
                      ) : null}
                      <ThreadWorkspaceTools
                        thread={activeThread}
                        snapshot={snapshot}
                        api={api}
                        run={run}
                        attempt={app.attempt}
                      />
                    </>
                  ) : undefined
                }
              />
            </Onboarding>
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
        onOpenModelSettings={() => {
          app.setAgentDialogOpen(false);
          app.openSettings('providers');
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
      <FeedbackDialog
        open={feedbackOpen}
        threadId={activeThread?.id}
        initialMessage={feedbackDraft}
        onOpenChange={(open) => {
          setFeedbackOpen(open);
          if (!open) setFeedbackDraft(undefined);
        }}
        onSubmit={(message, includeDiagnostics) =>
          app.attempt(() =>
            api.composeFeedback(message, activeThread?.id, includeDiagnostics),
          ) as Promise<void>
        }
      />
    </div>
  );
  return (
    <StartupTransition ready appearance={snapshot.preferences.appearance}>
      <AppearanceContext value={snapshot.preferences.appearance ?? 'expressive'}>
        {content}
      </AppearanceContext>
    </StartupTransition>
  );
}

function requiresSiaSignIn(state: RendererSnapshot['cloudAuth']['state']): boolean {
  return state !== 'signed-in' && state !== 'unconfigured';
}
