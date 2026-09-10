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
          <label>
            <input
              type="checkbox"
              checked={computer.backgroundControl === true}
              disabled={disabled}
              onChange={(event) => change('mac', event.target.checked)}
            />{' '}
            Background controls (experimental)
          </label>
          <p className={styles.settingsNote}>
            Uses controls tied to individual windows. Native shell commands are disabled in this
            mode so they cannot take over your screen. Applies to the next request.
          </p>
          <label>
            If background control cannot finish{' '}
            <select
              className={modeStyles.select}
              aria-label="Background fallback"
              value={computer.backgroundFallback ?? 'pause'}
              disabled={disabled || !computer.backgroundControl}
              onChange={(event) =>
                change('mac', true, event.target.value as 'pause' | 'foreground')
              }
            >
              <option value="pause">Pause and tell me</option>
              <option value="foreground">Allow brief foreground control</option>
            </select>
          </label>
          <p className={styles.settingsNote}>
            Sia requests background input and opening. Apps may still raise their own windows.
            Some controls cannot work without foreground access.
          </p>
        </div>
      ) : null}
      <p className={styles.settingsNote}>
        {computer.accessMode === 'mac'
          ? computer.backgroundControl
            ? 'Sia uses the existing apps through window controls. No Chrome attachment is needed. Executable scripts and arbitrary file output need normal native control. Complete sign-ins and macOS permission prompts yourself.'
            : 'Sia uses native commands, AppleScript, files and screen images, like Notch. It uses the ordinary app interface and may bring apps forward. No Chrome connection is required. Full bypass runs commands without a workspace sandbox or per-action prompts. Allow Accessibility, Screen Recording and app Automation; complete sign-ins yourself.'
          : 'Connect Chrome or individual services for structured access. Choose Use my Mac to work through existing browser windows without attaching Chrome.'}
      </p>
    </div>
  );
}
