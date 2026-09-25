import { Check, Moon, Sparkle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Appearance } from '../effects/appearance';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import styles from './AppearanceSettings.module.css';

export function AppearanceSettings({
  value,
  onChange,
}: {
  value: Appearance;
  onChange(value: Appearance): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function choose(next: Appearance) {
    if (pending || next === value) return;
    setPending(true);
    setError(undefined);
    try {
      await onChange(next);
    } catch (cause) {
      setError(errorMessage(cause, 'Appearance could not be saved.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <SettingsSectionHeader
      title="Appearance"
      description="A little atmosphere, or a quieter place to focus. Make Sia feel like you."
    >
      <InlineSettingsError message={error} />
      <fieldset className={styles.choices} disabled={pending}>
        <legend>Choose your atmosphere</legend>
        {(['calm', 'expressive'] as const).map((mode) => (
          <label key={mode} className={styles.choice} data-selected={value === mode}>
            <input
              type="radio"
              name="appearance"
              value={mode}
              checked={value === mode}
              onChange={() => void choose(mode)}
            />
            <span className={styles.preview} data-mode={mode} aria-hidden="true">
              <span className={styles.previewGlow} />
              <span className={styles.previewRail}>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.previewChat}>
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className={styles.title}>
              {mode === 'calm' ? <Moon size={18} /> : <Sparkle size={18} />}
              {mode === 'calm' ? 'Calm' : 'Expressive'}
              {value === mode && (
                <Check className={styles.check} size={17} aria-hidden="true" />
              )}
            </span>
            <span className={styles.description}>
              {mode === 'calm'
                ? 'Soft color. Still backgrounds. Less movement.'
                : 'Flowing auroras, shifting gradients, and reflective buttons.'}
            </span>
          </label>
        ))}
      </fieldset>
      <p className={styles.note}>
        Applies to Sia and the ⌘E launcher on this Mac. Your Mac’s Reduce Motion setting is
        always respected.
      </p>
    </SettingsSectionHeader>
  );
}
