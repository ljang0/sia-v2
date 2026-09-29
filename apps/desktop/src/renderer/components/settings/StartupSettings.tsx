import { useState } from 'react';
import styles from '../../ui.module.css';
import { Switch } from '../Switch';
import { errorMessage, InlineSettingsError } from './SettingsShared';

/**
 * Open Sia at login. Schedules and phone requests only run while Sia is open, so this sits near
 * the top of Settings → Computer and inline in the Schedules panel.
 */
export function StartupSettings({
  openAtLogin,
  onSetOpenAtLogin,
  compact = false,
}: {
  openAtLogin: boolean;
  onSetOpenAtLogin(enabled: boolean): Promise<void>;
  /** The short form used inside the Schedules panel. */
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <div className={compact ? styles.openAtLoginInline : styles.openAtLoginSetting}>
      <InlineSettingsError message={error} />
      <label className={styles.voicePreference}>
        <span>
          <strong>Open Sia at login</strong>
          <small>
            {compact
              ? 'Schedules run only while Sia is open and your Mac is awake.'
              : 'Scheduled tasks and phone requests run only while Sia is open and your Mac is awake. Start Sia when you log in so none are missed.'}
          </small>
        </span>
        <Switch
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
    </div>
  );
}
