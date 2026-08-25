import {
  ArrowClockwise,
  CheckSquareOffset,
  Database,
  Desktop,
  PlugsConnected,
  ShieldCheck,
  SpeakerHigh,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AppConnection, ProviderId, RendererApi, RendererSnapshot } from '../types';
import styles from '../ui.module.css';
import { AppsSettings } from './settings/AppsSettings';
import { ComputerSettings } from './settings/ComputerSettings';
import { PrivacySettings } from './settings/PrivacySettings';
import { ReleaseReviewSettings } from './settings/ReleaseReviewSettings';
import { ResearchArchiveSettings } from './settings/ResearchArchiveSettings';
import { ProvidersSettings } from './settings/ProvidersSettings';
import { VoiceSettings } from './settings/VoiceSettings';

export type SettingsSection =
  'providers' | 'apps' | 'computer' | 'voice' | 'privacy' | 'release' | 'research';

interface SettingsProps {
  snapshot: RendererSnapshot;
  initialSection?: SettingsSection | undefined;
  onClose(): void;
  onProbeProvider(provider: ProviderId): Promise<void>;
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
  onOpenBrowserSite(url: string): Promise<void>;
  onDetachBrowser(): Promise<void>;
  onRequestPermissions(): Promise<void>;
  onSetComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  onUnlockComputer(): Promise<void>;
  onSetTrajectoryLog(enabled: boolean): Promise<void>;
  onRevealTrajectories(): Promise<void>;
  onOpenMessages(): Promise<void>;
  onConfigureVoice(apiKey: string): Promise<void>;
  onRefreshVoices(): Promise<void>;
  onSelectVoice(voiceId: string): Promise<void>;
  onDisconnectVoice(): Promise<void>;
  onSetCompletionSound(enabled: boolean): Promise<void>;
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
  snapshot,
  initialSection = 'providers',
  onClose,
  onProbeProvider,
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
  onOpenBrowserSite,
  onDetachBrowser,
  onRequestPermissions,
  onSetComputerTrust,
  onUnlockComputer,
  onSetTrajectoryLog,
  onRevealTrajectories,
  onOpenMessages,
  onConfigureVoice,
  onRefreshVoices,
  onSelectVoice,
  onDisconnectVoice,
  onSetCompletionSound,
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
          <p>Accounts, capabilities, and data controls</p>
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
            icon={<ArrowClockwise size={17} aria-hidden="true" />}
            label="Providers"
            onClick={() => setSection('providers')}
          />
          <SettingsNavButton
            active={section === 'apps'}
            icon={<PlugsConnected size={17} aria-hidden="true" />}
            label="Apps"
            onClick={() => setSection('apps')}
          />
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
          <SettingsNavButton
            active={section === 'privacy'}
            icon={<ShieldCheck size={17} aria-hidden="true" />}
            label="Privacy"
            onClick={() => setSection('privacy')}
          />
          {canReviewRelease ? (
            <SettingsNavButton
              active={section === 'release'}
              icon={<CheckSquareOffset size={17} aria-hidden="true" />}
              label="Release review"
              onClick={() => setSection('release')}
            />
          ) : null}
          {canViewResearchArchive ? (
            <SettingsNavButton
              active={section === 'research'}
              icon={<Database size={17} aria-hidden="true" />}
              label="Research archive"
              onClick={() => setSection('research')}
            />
          ) : null}
        </nav>

        <div key={section} className={styles.settingsContent}>
          {section === 'providers' ? (
            <ProvidersSettings
              providers={snapshot.providers}
              onProbe={onProbeProvider}
              onOpenCloudSettings={() => setSection('apps')}
            />
          ) : null}
          {section === 'apps' ? (
            <AppsSettings
              snapshot={snapshot}
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
              onAttachBrowser={onAttachBrowser}
              onOpenBrowserSite={onOpenBrowserSite}
              onDetachBrowser={onDetachBrowser}
              onRequestPermissions={onRequestPermissions}
              onSetComputerTrust={onSetComputerTrust}
              onUnlockComputer={onUnlockComputer}
              onSetTrajectoryLog={onSetTrajectoryLog}
              onRevealTrajectories={onRevealTrajectories}
            />
          ) : null}
          {section === 'voice' ? (
            <VoiceSettings
              voice={snapshot.voice}
              completionSound={snapshot.preferences.completionSound}
              onConfigure={onConfigureVoice}
              onRefresh={onRefreshVoices}
              onSelect={onSelectVoice}
              onDisconnect={onDisconnectVoice}
              onSetCompletionSound={onSetCompletionSound}
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
