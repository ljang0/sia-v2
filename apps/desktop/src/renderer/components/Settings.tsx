import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { MacSetupApi } from './SetupMacAccess';
import {
  CaretDown,
  Code,
  Palette,
  CheckSquareOffset,
  Database,
  Desktop,
  Info,
  PlugsConnected,
  ShieldCheck,
  Sparkle,
  SpeakerHigh,
  DeviceMobile,
  PawPrint,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AppConnection, ProviderId, RendererApi, RendererSnapshot } from '../types';
import styles from '../ui.module.css';
import { AssistantSettings } from './settings/AssistantSettings';
import { AboutSettings } from './settings/AboutSettings';
import { AdvancedSettings } from './settings/AdvancedSettings';
import { AppsSettings } from './settings/AppsSettings';
import { ComputerSettings } from './settings/ComputerSettings';
import { PrivacySettings } from './settings/PrivacySettings';
import { ReleaseReviewSettings } from './settings/ReleaseReviewSettings';
import { ResearchArchiveSettings } from './settings/ResearchArchiveSettings';
import { ProvidersSettings } from './settings/ProvidersSettings';
import { PhoneRemoteSettings } from './settings/PhoneRemoteSettings';
import { ScottySettings } from './settings/ScottySettings';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { VoiceSettings } from './settings/VoiceSettings';
import { StartupSettings } from './settings/StartupSettings';

export type SettingsSection =
  | 'appearance'
  | 'assistant'
  | 'providers'
  | 'apps'
  | 'computer'
  | 'voice'
  | 'scotty'
  | 'phone'
  | 'privacy'
  | 'about'
  | 'advanced'
  | 'release'
  | 'research';

interface SettingsProps {
  scottyApi?: import('../../shared/scotty').ScottySettingsApi | undefined;
  phoneRemoteApi?: import('../../shared/phone-remote').PhoneRemoteApi | undefined;
  assistantApi?: Pick<RendererApi, 'assistantLibrary'>;
  onRunWorkflow?: (threadId: string) => void;
  snapshot: RendererSnapshot;
  initialSection?: SettingsSection | undefined;
  onClose(): void;
  onOpenFeedback?: (() => void) | undefined;
  onProbeProvider(provider: ProviderId): Promise<void>;
  onOpenProviderSetup(provider: ProviderId): Promise<void>;
  onCheckForUpdates(): Promise<void>;
  onOpenUpdateDownload(): Promise<void>;
  onConnectSelectedApps(apps: ('google' | 'slack')[]): Promise<void>;
  onConnectGoogleApps(): Promise<void>;
  onUpgradeGoogleApps(): Promise<void>;
  onConnectApp(app: AppConnection['id']): Promise<void>;
  onSetAppEnabled?(app: AppConnection['id'], enabled: boolean): Promise<void>;
  onDisconnectApp(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
  onStartCloudSignIn(email: string): Promise<void>;
  onCompleteCloudSignIn(code: string): Promise<void>;
  onBeginAdminMfa(): Promise<{ secretCode: string }>;
  onCompleteAdminMfa(code: string): Promise<void>;
  onSignOutCloud(): Promise<void>;
  onDeleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<void>;
  onAttachBrowser(windowId?: number): Promise<void>;
  onDetachBrowser(): Promise<void>;
  macSetupApi: MacSetupApi;
  onSetComputerAccessMode?(
    mode: 'mac' | 'connected',
    background?: boolean,
    backgroundFallback?: 'pause' | 'foreground',
  ): Promise<void>;
  onSetComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  onSetTrajectoryLog(enabled: boolean): Promise<void>;
  onRevealTrajectories(): Promise<void>;
  onOpenMessages(): Promise<void>;
  onConfigureVoice(): Promise<void>;
  onRefreshVoices(): Promise<void>;
  onSelectVoice(voiceId: string): Promise<void>;
  onDisconnectVoice(): Promise<void>;
  onConfigurePushToTalk?:
    ((enabled: boolean, agentId?: string, speakReplies?: boolean) => Promise<void>) | undefined;
  onStartSetup?: (() => void) | undefined;
  onSetAppearance?: ((appearance: 'calm' | 'expressive') => Promise<void>) | undefined;
  onSetCompletionSound(enabled: boolean): Promise<void>;
  onSetOpenAtLogin?: ((enabled: boolean) => Promise<void>) | undefined;
  onSetDeveloperTools?: ((enabled: boolean) => Promise<void>) | undefined;
  onSetCapturePaused(paused: boolean): Promise<void>;
  onExport(): Promise<void>;
  onDelete(): Promise<void>;
  onListResearchInvites: RendererApi['listResearchInvites'];
  onCreateResearchInvite: RendererApi['createResearchInvite'];
  onListResearchParticipants: RendererApi['listResearchParticipants'];
  onListResearchBatches: RendererApi['listResearchBatches'];
  onReadResearchBatch: RendererApi['readResearchBatch'];
}

export function Settings({
  scottyApi,
  phoneRemoteApi,
  assistantApi,
  onRunWorkflow,
  snapshot,
  initialSection = 'providers',
  onClose,
  onOpenFeedback,
  onProbeProvider,
  onOpenProviderSetup,
  onCheckForUpdates,
  onOpenUpdateDownload,
  onConnectSelectedApps,
  onConnectGoogleApps,
  onUpgradeGoogleApps,
  onConnectApp,
  onSetAppEnabled = async () => undefined,
  onDisconnectApp,
  onStartCloudSignIn,
  onCompleteCloudSignIn,
  onBeginAdminMfa,
  onCompleteAdminMfa,
  onSignOutCloud,
  onDeleteCloudAccount,
  onAttachBrowser,
  onDetachBrowser,
  macSetupApi,
  onSetComputerAccessMode,
  onSetComputerTrust,
  onSetTrajectoryLog,
  onRevealTrajectories,
  onOpenMessages,
  onConfigureVoice,
  onRefreshVoices,
  onSelectVoice,
  onDisconnectVoice,
  onSetAppearance,
  onSetCompletionSound,
  onSetOpenAtLogin,
  onSetDeveloperTools,
  onStartSetup,
  onConfigurePushToTalk,
  onSetCapturePaused,
  onExport,
  onDelete,
  onListResearchInvites,
  onCreateResearchInvite,
  onListResearchParticipants,
  onListResearchBatches,
  onReadResearchBatch,
}: SettingsProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const usesMac = snapshot.computer.accessMode === 'mac';
  const canReviewRelease = Boolean(snapshot.cloudAuth.admin && snapshot.cloudAuth.adminMfa);
  const canViewResearchArchive = Boolean(
    canReviewRelease && snapshot.cloudAuth.features?.researchArchive !== false,
  );

  useEffect(() => {
    if (
      (section === 'release' && !canReviewRelease) ||
      (section === 'research' && !canViewResearchArchive)
    ) {
      setSection('providers');
    }
  }, [canReviewRelease, canViewResearchArchive, section]);

  return (
    <main className={styles.settingsPage} data-companion-settings>
      <header className={styles.settingsTopbar}>
        <div>
          <h1>Settings</h1>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.settingsLayout}>
        <nav className={styles.settingsNav} aria-label="Settings sections">
          <SettingsNavButton
            active={section === 'providers'}
            icon={<Sparkle size={17} aria-hidden="true" />}
            label="AI"
            onClick={() => setSection('providers')}
          />
          {!usesMac && (
            <SettingsNavButton
              active={section === 'apps'}
              icon={<PlugsConnected size={17} aria-hidden="true" />}
              label="Connections"
              onClick={() => setSection('apps')}
            />
          )}
          <SettingsNavButton
            active={section === 'computer'}
            icon={<Desktop size={17} aria-hidden="true" />}
            label="Computer"
            onClick={() => setSection('computer')}
          />
          <SettingsNavButton
            active={section === 'voice'}
            icon={<SpeakerHigh size={17} aria-hidden="true" />}
            label="Voice"
            onClick={() => setSection('voice')}
          />
          {scottyApi && (
            <SettingsNavButton
              active={section === 'scotty'}
              icon={<PawPrint size={17} aria-hidden="true" />}
              label="Scotty"
              onClick={() => setSection('scotty')}
            />
          )}
          {phoneRemoteApi && (
            <SettingsNavButton
              active={section === 'phone'}
              icon={<DeviceMobile size={17} aria-hidden="true" />}
              label="Phone remote"
              onClick={() => setSection('phone')}
            />
          )}
          <SettingsNavButton
            active={section === 'privacy'}
            icon={<ShieldCheck size={17} aria-hidden="true" />}
            label="Privacy"
            onClick={() => setSection('privacy')}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={
                  [
                    'appearance',
                    'about',
                    'advanced',
                    'assistant',
                    'release',
                    'research',
                  ].includes(section) ||
                  (usesMac && section === 'apps')
                    ? styles.settingsNavActive
                    : undefined
                }
                aria-label="More settings"
              >
                More <CaretDown size={12} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.threadMenuContent}
                align="end"
                sideOffset={6}
              >
                {onSetAppearance && (
                  <SettingsMenuItem
                    icon={<Palette size={17} />}
                    label="Appearance"
                    onSelect={() => setSection('appearance')}
                  />
                )}
                <SettingsMenuItem
                  icon={<Info size={17} />}
                  label="About"
                  onSelect={() => setSection('about')}
                />
                {assistantApi && (
                  <SettingsMenuItem
                    icon={<Sparkle size={17} />}
                    label="Assistant"
                    onSelect={() => setSection('assistant')}
                  />
                )}
                {usesMac && (
                  <SettingsMenuItem
                    icon={<PlugsConnected size={17} />}
                    label="Connections"
                    onSelect={() => setSection('apps')}
                  />
                )}
                {onSetDeveloperTools && (
                  <SettingsMenuItem
                    icon={<Code size={17} />}
                    label="Advanced"
                    onSelect={() => setSection('advanced')}
                  />
                )}
                {canReviewRelease && (
                  <SettingsMenuItem
                    icon={<CheckSquareOffset size={17} />}
                    label="Release review"
                    onSelect={() => setSection('release')}
                  />
                )}
                {canViewResearchArchive && (
                  <SettingsMenuItem
                    icon={<Database size={17} />}
                    label="Research archive"
                    onSelect={() => setSection('research')}
                  />
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </nav>

        <div key={section} className={styles.settingsContent}>
          {section === 'appearance' && onSetAppearance && (
            <AppearanceSettings
              value={snapshot.preferences.appearance ?? 'expressive'}
              onChange={onSetAppearance}
            />
          )}
          {section === 'scotty' && scottyApi && <ScottySettings api={scottyApi} />}
          {section === 'phone' && phoneRemoteApi && (
            <PhoneRemoteSettings
              api={phoneRemoteApi}
              agents={snapshot.agents}
              providers={snapshot.providers}
            />
          )}
          {section === 'assistant' && assistantApi && (
            <AssistantSettings
              accessMode={snapshot.computer.accessMode ?? 'connected'}
              backgroundControl={snapshot.computer.backgroundControl ?? false}
              agents={snapshot.agents}
              api={assistantApi}
              onRun={onRunWorkflow ?? (() => undefined)}
            />
          )}
          {section === 'providers' ? (
            <ProvidersSettings
              providers={snapshot.providers}
              onProbe={onProbeProvider}
              onOpenProviderSetup={onOpenProviderSetup}
              onOpenCloudSettings={() => setSection('apps')}
            />
          ) : null}
          {section === 'apps' ? (
            <AppsSettings
              snapshot={snapshot}
              onConnectSelected={onConnectSelectedApps}
              onConnectGoogle={onConnectGoogleApps}
              onUpgradeGoogle={onUpgradeGoogleApps}
              onConnect={onConnectApp}
              onSetEnabled={onSetAppEnabled}
              onDisconnect={onDisconnectApp}
              onStartCloudSignIn={onStartCloudSignIn}
              onCompleteCloudSignIn={onCompleteCloudSignIn}
              onBeginAdminMfa={onBeginAdminMfa}
              onCompleteAdminMfa={onCompleteAdminMfa}
              onSignOutCloud={onSignOutCloud}
              onDeleteCloudAccount={onDeleteCloudAccount}
              onAttachBrowser={onAttachBrowser}
              onDetachBrowser={onDetachBrowser}
              onOpenMessages={onOpenMessages}
              onReviewComputerAccess={() => setSection('computer')}
            />
          ) : null}
          {section === 'computer' ? (
            <ComputerSettings
              snapshot={snapshot}
              onReviewConnections={() => setSection('apps')}
              macSetupApi={macSetupApi}
              {...(onSetComputerAccessMode ? { onSetComputerAccessMode } : {})}
              onSetComputerTrust={onSetComputerTrust}
              onSetTrajectoryLog={onSetTrajectoryLog}
              onRevealTrajectories={onRevealTrajectories}
              startup={
                onSetOpenAtLogin ? (
                  <StartupSettings
                    openAtLogin={snapshot.preferences.openAtLogin === true}
                    onSetOpenAtLogin={onSetOpenAtLogin}
                  />
                ) : undefined
              }
            />
          ) : null}
          {section === 'advanced' && onSetDeveloperTools ? (
            <AdvancedSettings
              developerTools={snapshot.preferences.developerTools === true}
              onSetDeveloperTools={onSetDeveloperTools}
            />
          ) : null}
          {section === 'voice' ? (
            <VoiceSettings
              voice={snapshot.voice}
              agents={snapshot.agents}
              onConfigurePushToTalk={onConfigurePushToTalk}
              completionSound={snapshot.preferences.completionSound}
              onConfigure={onConfigureVoice}
              onRefresh={onRefreshVoices}
              onSelect={onSelectVoice}
              onDisconnect={onDisconnectVoice}
              onSetCompletionSound={onSetCompletionSound}
              onStartSetup={onStartSetup}
            />
          ) : null}
          {section === 'privacy' ? (
            <PrivacySettings
              snapshot={snapshot}
              onSetCapturePaused={onSetCapturePaused}
              onExport={onExport}
              onDelete={onDelete}
            />
          ) : null}
          {section === 'about' ? (
            <AboutSettings
              updates={snapshot.updates}
              onOpenFeedback={onOpenFeedback}
              onCheckForUpdates={onCheckForUpdates}
              onOpenUpdateDownload={onOpenUpdateDownload}
            />
          ) : null}
          {section === 'release' && canReviewRelease ? (
            <ReleaseReviewSettings
              snapshot={snapshot}
              onOpenPrivacy={() => setSection('privacy')}
              onOpenVoice={() => setSection('voice')}
              onOpenArchive={canViewResearchArchive ? () => setSection('research') : undefined}
            />
          ) : null}
          {section === 'research' && canViewResearchArchive ? (
            <ResearchArchiveSettings
              listInvites={onListResearchInvites}
              createInvite={onCreateResearchInvite}
              listParticipants={onListResearchParticipants}
              listBatches={onListResearchBatches}
              readBatch={onReadResearchBatch}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function SettingsNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={active ? styles.settingsNavActive : ''}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SettingsMenuItem({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect(): void;
}) {
  return (
    <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onSelect}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </DropdownMenu.Item>
  );
}
