import { useEffect } from 'react';
import type { RendererApi, RendererSnapshot } from '../types';
import { dictationReady } from '../voiceReadiness';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import { automationApps } from '../../shared/mac-permissions';
import styles from './Onboarding.module.css';

export type AccessSetupApi = Pick<
  RendererApi,
  | 'getSnapshot'
  | 'requestComputerPermissions'
  | 'configureVoice'
  | 'configurePushToTalk'
  | 'requestAutomationPermission'
  | 'refreshComputerPermissions'
>;

export function SetupMacAccess({
  snapshot,
  api,
  agentId,
  disabled,
  onBusyChange,
  autoStart = false,
  compact = false,
  onComplete,
  onReadyChange,
  includeApps = false,
}: {
  snapshot: RendererSnapshot;
  api: AccessSetupApi;
  agentId: string | undefined;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  autoStart?: boolean;
  compact?: boolean;
  onComplete?(): Promise<void>;
  onReadyChange?(ready: boolean): void;
  includeApps?: boolean;
}) {
  // Returning from a system permission panel updates the same checklist without
  // replaying prompts or requiring a second setup click.
  useEffect(() => {
    const refresh = () => {
      void api.refreshComputerPermissions().catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [api]);
  const ptt = snapshot.voice.pushToTalk;
  const voiceAvailable = Boolean(ptt?.available) && snapshot.voice.dictationAvailable !== false;
  const voiceReady = dictationReady(snapshot.voice);
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';
  const prepare = async () => {
    const failures: string[] = [];
    const attempt = async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : 'Permission setup did not finish.',
        );
      }
    };
    let current = snapshot;
    if (!computerReady)
      await attempt(async () => {
        await api.requestComputerPermissions();
        current = await api.getSnapshot();
      });
    if (!dictationReady(current.voice) && agentId && voiceAvailable)
      await attempt(async () => {
        if (current.voice.status !== 'connected') {
          await api.configureVoice();
          current = await api.getSnapshot();
        }
        if (current.voice.dictationAvailable !== false)
          await api.configurePushToTalk(
            true,
            agentId,
            current.computer.accessibility === 'allowed',
          );
      });
    if (failures.length) throw new Error(failures.join('; '));
  };
  const rows = [
    [
      'Accessibility',
      snapshot.computer.accessibility === 'allowed',
      true,
      snapshot.computer.accessibility === 'denied'
        ? 'Enable Sia in System Settings → Privacy & Security → Accessibility.'
        : 'Click, type, and use the Fn shortcut.',
    ],
    [
      'Screen Recording',
      snapshot.computer.screenRecording === 'allowed',
      true,
      snapshot.computer.screenRecording === 'denied'
        ? 'Enable Sia in System Settings → Privacy & Security → Screen Recording. Restart Sia if macOS asks.'
        : 'See apps and verify task results.',
    ],
    [
      'Voice and microphone',
      voiceReady,
      voiceAvailable,
      snapshot.voice.dictationDetail ??
        (voiceAvailable
          ? snapshot.voice.engine === 'macos' && snapshot.voice.speechRecognition !== 'allowed'
            ? 'Allow Speech Recognition, microphone, and Fn shortcut access. Setup does not record.'
            : 'Hold Fn to dictate. Setup does not start a recording.'
          : 'Unavailable on this device.'),
    ],
  ] as const;
  const available = rows.filter(([, , supported]) => supported);
  const coreReady = available.every(([, allowed]) => allowed);
  const appStates = includeApps
    ? automationApps
        .map(({ id }) => snapshot.computer.automation?.[id] ?? 'needs_permission')
        .filter((status) => status !== 'unavailable')
    : [];
  const ready =
    available.filter(([, allowed]) => allowed).length +
    appStates.filter((status) => status === 'ready').length;
  const total = available.length + appStates.length;
  useEffect(() => {
    onReadyChange?.(ready === total);
  }, [onReadyChange, ready, total]);
  return (
    <MacAutomationPermissions
      permissions={snapshot.computer.automation}
      includeApps={includeApps}
      autoStart={autoStart}
      compact={compact}
      {...(onComplete ? { onComplete } : {})}
      summary={
        <p className={styles.accessSummary} role="status">
          <strong>
            {ready === total
              ? 'Ready to use Sia.'
              : coreReady
                ? 'Core access is ready.'
                : `${ready} of ${total} setup permissions ready`}
          </strong>
          <span>
            {ready === total
              ? includeApps
                ? 'Common app access is included below. You can finish any missing access later.'
                : 'Other apps ask for access when a task needs them.'
              : coreReady
                ? `${ready} of ${total} permissions ready. Remaining app access is optional; you can finish it later.`
                : 'Approve the macOS prompts, then return here. Status updates automatically. You can finish missing access later.'}
          </span>
        </p>
      }
      request={(app) => api.requestAutomationPermission(app)}
      refresh={() => api.refreshComputerPermissions()}
      disabled={disabled}
      prepare={prepare}
      onBusyChange={onBusyChange}
      needsPreparation={!computerReady || (!voiceReady && voiceAvailable)}
    >
      {rows.map(([name, ready, available, detail]) => (
        <li className={styles.permission} key={name}>
          <div>
            <strong>{name}</strong>
            <p>{detail}</p>
          </div>
          <span className={ready ? styles.ready : styles.status}>
            {ready ? 'Allowed' : available ? 'Needs access' : 'Unavailable'}
          </span>
        </li>
      ))}
    </MacAutomationPermissions>
  );
}
