import { useState } from 'react';
import styles from '../../ui.module.css';
import {
  errorMessage,
  InlineSettingsError,
  SavedNote,
  SettingsSectionHeader,
  useSavedFlash,
} from './SettingsShared';
import { Switch } from '../Switch';

/** Developer-only surfaces stay out of the main path until someone opts in here. */
export function AdvancedSettings({
  developerTools,
  onSetDeveloperTools,
}: {
  developerTools: boolean;
  onSetDeveloperTools(enabled: boolean): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, flashSaved] = useSavedFlash();

  return (
    <SettingsSectionHeader
      title="Advanced"
      description="Options for people who build software. Most people can leave these off."
    >
      <InlineSettingsError message={error} />
      <label className={styles.voicePreference}>
        <span>
          <strong>
            Developer tools <SavedNote show={saved} />
          </strong>
          <small>
            Adds Command to a conversation’s Tools menu, a Git worktree option when you
            duplicate a conversation, and View → Reload. Commands run in the agent’s folder
            right away, without asking first.
          </small>
        </span>
        <Switch
          checked={developerTools}
          disabled={pending}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            setPending(true);
            setError(undefined);
            void onSetDeveloperTools(enabled)
              .then(flashSaved)
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
