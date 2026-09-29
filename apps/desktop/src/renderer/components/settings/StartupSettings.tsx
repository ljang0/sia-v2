import { useState } from 'react';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

/** Where schedules are explained: they only run while Sia is open, so offer to open it at login. */
export function StartupSettings({
  openAtLogin,
  onSetOpenAtLogin,
}: {
  openAtLogin: boolean;
  onSetOpenAtLogin(enabled: boolean): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <SettingsSectionHeader
      title="Scheduled tasks"
      description="Scheduled tasks and phone requests run only while Sia is open and your Mac is awake."
    >
      <InlineSettingsError message={error} />
      <label className={styles.voicePreference}>
        <span>
          <strong>Open Sia at login</strong>
          <small>
            Start Sia when you log in to your Mac so scheduled tasks are not missed.
          </small>
        </span>
        <input
          type="checkbox"
          checked={openAtLogin}
          disabled={pending}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            setPending(true);
            setError(undefined);
            void onSetOpenAtLogin(enabled)
              .catch((cause: unknown) =>
                setError(errorMessage(cause, 'This setting could not be changed.')),
              )
              .finally(() => setPending(false));
          }}
        />
      </label>
    </SettingsSectionHeader>
  );
}
