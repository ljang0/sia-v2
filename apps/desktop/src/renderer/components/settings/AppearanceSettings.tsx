import { Check, Desktop, Moon, MoonStars, Sparkle, Sun } from '@phosphor-icons/react';
import { useState } from 'react';
import type { TextSize, ThemePreference } from '../../../shared/display';
import type { Appearance } from '../effects/appearance';
import { InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import styles from './AppearanceSettings.module.css';
import { errorMessage } from '../../plainErrors';

const THEME_CHOICES = [
  { value: 'system', label: 'System', icon: <Desktop size={15} aria-hidden="true" /> },
  { value: 'light', label: 'Light', icon: <Sun size={15} aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <MoonStars size={15} aria-hidden="true" /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: unknown }[];

const TEXT_SIZE_CHOICES = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
] as const satisfies readonly { value: TextSize; label: string }[];

/** A row of options that saves as soon as one is picked (Theme, Text size). */
function SegmentedSetting<T extends string>({
  name,
  title,
  description,
  value,
  choices,
  disabled,
  onChoose,
}: {
  name: string;
  title: string;
  description: string;
  value: T;
  choices: readonly { value: T; label: string; icon?: React.ReactNode }[];
  disabled: boolean;
  onChoose(value: T): void;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <h3 id={`${name}-title`}>{title}</h3>
        <p id={`${name}-description`}>{description}</p>
      </div>
      <div
        className={styles.segmented}
        role="radiogroup"
        aria-labelledby={`${name}-title`}
        aria-describedby={`${name}-description`}
      >
        {choices.map((choice) => (
          <label key={choice.value} data-selected={value === choice.value}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              disabled={disabled}
              onChange={() => onChoose(choice.value)}
            />
            {choice.icon}
            {choice.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function AppearanceSettings({
  value,
  onChange,
  theme = 'system',
  onSetTheme,
  textSize = 'default',
  onSetTextSize,
}: {
  value: Appearance;
  onChange(value: Appearance): Promise<void>;
  theme?: ThemePreference | undefined;
  onSetTheme?: ((theme: ThemePreference) => Promise<void>) | undefined;
  textSize?: TextSize | undefined;
  onSetTextSize?: ((textSize: TextSize) => Promise<void>) | undefined;
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
  async function save(change: () => Promise<void>, fallback: string) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await change();
    } catch (cause) {
      setError(errorMessage(cause, fallback));
    } finally {
      setPending(false);
    }
  }
  return (
    <SettingsSectionHeader
      title="Appearance"
      description="Light or dark, how big text is, and how lively Sia feels. Make Sia feel like you."
    >
      <InlineSettingsError message={error} />
      <div className={styles.rows}>
        {onSetTheme && (
          <SegmentedSetting
            name="theme"
            title="Theme"
            description="System matches your Mac’s light or dark setting."
            value={theme}
            choices={THEME_CHOICES}
            disabled={pending}
            onChoose={(next) =>
              next !== theme && void save(() => onSetTheme(next), 'Theme could not be saved.')
            }
          />
        )}
        {onSetTextSize && (
          <SegmentedSetting
            name="text-size"
            title="Text size"
            description="Makes words bigger or smaller across Sia. ⌘+ and ⌘− work too."
            value={textSize}
            choices={TEXT_SIZE_CHOICES}
            disabled={pending}
            onChoose={(next) =>
              next !== textSize &&
              void save(() => onSetTextSize(next), 'Text size could not be saved.')
            }
          />
        )}
      </div>
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
        Applies to Sia, Scotty, and the ⌘E launcher on this Mac. Your Mac’s Reduce Motion
        setting is always respected.
      </p>
    </SettingsSectionHeader>
  );
}
