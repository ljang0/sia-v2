import { useId } from 'react';
import type { RendererSnapshot } from '../types';
import styles from '../ui.module.css';
import modeStyles from './ComputerAccessMode.module.css';

export function ComputerAccessMode({
  computer,
  disabled,
  change,
  showBackgroundOption = false,
}: {
  computer: RendererSnapshot['computer'];
  disabled?: boolean | undefined;
  change(
    mode: 'mac' | 'connected',
    background?: boolean,
    backgroundFallback?: 'pause' | 'foreground',
  ): void;
  showBackgroundOption?: boolean;
}) {
  const controlId = useId();
  return (
    <div className={styles.accessGroup}>
      <div className={modeStyles.row}>
        <div>
          <strong>How Sia uses your apps</strong>
          <p>
            Use your signed-in browser and Mac apps directly, or choose individual connections.
            Action confirmations are a separate setting.
          </p>
        </div>
        <select
          className={modeStyles.select}
          aria-label="App access mode"
          value={computer.accessMode ?? 'connected'}
          disabled={disabled}
          onChange={(event) => change(event.target.value as 'mac' | 'connected')}
        >
          <option value="mac">Use my Mac</option>
          <option value="connected">Connected apps</option>
        </select>
      </div>
      {computer.accessMode === 'mac' && showBackgroundOption ? (
        <div>
          <fieldset className={modeStyles.controls} disabled={disabled}>
            <legend>Where Sia works</legend>
            <div className={modeStyles.choices}>
              <label className={modeStyles.choice}>
                <input
                  type="radio"
                  name={controlId}
                  checked={!computer.backgroundControl}
                  onChange={() => change('mac', false)}
                />
                <span>
                  <strong>On my screen</strong>
                  <span>
                    Full native control, including saved scripts. Apps may come forward.
                  </span>
                </span>
              </label>
              <label className={modeStyles.choice}>
                <input
                  type="radio"
                  name={controlId}
                  checked={computer.backgroundControl === true}
                  onChange={() => change('mac', true)}
                />
                <span>
                  <strong>Work in background</strong>
                  <span>
                    Experimental window controls while you keep working. No Chrome connection.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <p className={styles.settingsNote}>
            Applies to your next typed or Fn request. Both modes use this agent's saved memory
            and task history. Background skills can reuse window actions and create workspace
            reports without taking focus. Native scripts require On my screen.
          </p>
          {computer.backgroundControl ? (
            <div className={modeStyles.row}>
              <label htmlFor={`${controlId}-fallback`}>When a step needs the screen</label>
              <select
                id={`${controlId}-fallback`}
                className={modeStyles.select}
                aria-label="Background fallback"
                value={computer.backgroundFallback ?? 'pause'}
                disabled={disabled}
                onChange={(event) =>
                  change('mac', true, event.target.value as 'pause' | 'foreground')
                }
              >
                <option value="pause">Pause and tell me</option>
                <option value="foreground">Allow brief foreground control</option>
              </select>
            </div>
          ) : null}
          <p className={styles.settingsNote}>
            Sia requests background input and opening. Apps may still raise their own windows.
            Some controls cannot work without foreground access.
          </p>
        </div>
      ) : null}
      <p className={styles.settingsNote}>
        {computer.accessMode === 'mac'
          ? computer.backgroundControl
            ? 'Sia uses your existing apps, saved lessons and background skills. It can create text, CSV and JSON reports in the task workspace. Some app controls still need brief foreground access. Complete sign-ins and macOS permission prompts yourself.'
            : 'Sia uses native commands, AppleScript, files and screen images, like Notch. It uses the ordinary app interface and may bring apps forward. No Chrome connection is required. Full bypass runs commands without a workspace sandbox or per-action prompts. Allow Accessibility, Screen Recording and app Automation; complete sign-ins yourself.'
          : 'Connect Chrome or individual services for structured access. Choose Use my Mac to work through existing browser windows without attaching Chrome.'}
      </p>
    </div>
  );
}
