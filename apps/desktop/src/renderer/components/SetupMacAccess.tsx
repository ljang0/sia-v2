import type { RendererApi, RendererSnapshot } from '../types';
import { automationApps } from '../../shared/mac-permissions';
import { dictationReady } from '../voiceReadiness';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import styles from './Onboarding.module.css';

export function SetupMacAccess({
  snapshot,
  api,
  agentId,
  disabled,
  onBusyChange,
  autoStart = false,
  compact = false,
  onComplete,
}: {
  snapshot: RendererSnapshot;
  api: RendererApi;
  agentId: string | undefined;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  autoStart?: boolean;
  compact?: boolean;
  onComplete?(): Promise<void>;
}) {
  const ptt = snapshot.voice.pushToTalk;
  const voiceAvailable = Boolean(ptt?.available) && snapshot.voice.dictationAvailable !== false;
  const voiceReady = dictationReady(snapshot.voice);
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';
  const messagesReady = ['ready', 'unavailable'].includes(
    snapshot.computer.messagesAccess ?? 'unavailable',
  );
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
    if (!computerReady) await attempt(() => api.requestComputerPermissions());
    if (!voiceReady && agentId && voiceAvailable)
      await attempt(async () => {
        if (snapshot.voice.status !== 'connected') await api.configureVoice();
        if (snapshot.voice.dictationAvailable !== false)
          await api.configurePushToTalk(
            true,
            agentId,
            snapshot.computer.accessibility === 'allowed',
          );
      });
    if (!messagesReady) await attempt(() => api.setupMessages());
    if (failures.length) throw new Error(failures.join('; '));
  };
  const rows = [
    [
      'Accessibility',
      snapshot.computer.accessibility === 'allowed',
      true,
      'Click, type, and use the Fn shortcut.',
    ],
    [
      'Screen Recording',
      snapshot.computer.screenRecording === 'allowed',
      true,
      'See apps and verify task results.',
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
    [
      'Messages history',
      snapshot.computer.messagesAccess === 'ready',
      Boolean(
        snapshot.computer.messagesAccess && snapshot.computer.messagesAccess !== 'unavailable',
      ),
      messagesReady
        ? 'Full Disk Access for message history.'
        : 'Enable Full Disk Access in System Settings.',
    ],
  ] as const;
  const available = rows.filter(([, , supported]) => supported);
  const apps = automationApps.filter(
    ({ id }) => snapshot.computer.automation?.[id] !== 'unavailable',
  );
  const ready =
    available.filter(([, allowed]) => allowed).length +
    apps.filter(({ id }) => snapshot.computer.automation?.[id] === 'ready').length;
  const total = available.length + apps.length;
  return (
    <MacAutomationPermissions
      permissions={snapshot.computer.automation}
      autoStart={autoStart}
      compact={compact}
      {...(onComplete ? { onComplete } : {})}
      summary={
        <p className={styles.accessSummary} role="status">
          <strong>
            {ready === total
              ? 'All available access is ready.'
              : `${ready} of ${total} permissions ready`}
          </strong>
          <span>
            {ready === total
              ? 'You’re ready to start.'
              : 'You can start now and finish missing access later.'}
          </span>
        </p>
      }
      request={(app) => api.requestAutomationPermission(app)}
      refresh={() => api.refreshComputerPermissions()}
      disabled={disabled}
      prepare={prepare}
      onBusyChange={onBusyChange}
      needsPreparation={!computerReady || (!voiceReady && voiceAvailable) || !messagesReady}
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
