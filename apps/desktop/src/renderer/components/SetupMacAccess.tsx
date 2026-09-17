import type { RendererApi, RendererSnapshot } from '../types';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import styles from './Onboarding.module.css';

export function SetupMacAccess({
  snapshot,
  api,
  agentId,
  disabled,
  onBusyChange,
}: {
  snapshot: RendererSnapshot;
  api: RendererApi;
  agentId: string | undefined;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
}) {
  const ptt = snapshot.voice.pushToTalk;
  const voiceAvailable = Boolean(ptt?.available) && snapshot.voice.dictationAvailable !== false;
  const voiceReady =
    snapshot.voice.status === 'connected' &&
    snapshot.voice.dictationAvailable !== false &&
    Boolean(ptt?.enabled && ptt.accessibility && ptt.microphone);
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
          ? 'Hold Fn to dictate. Setup does not start a recording.'
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
  return (
    <MacAutomationPermissions
      permissions={snapshot.computer.automation}
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
