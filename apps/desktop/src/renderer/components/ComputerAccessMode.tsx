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
  change(mode: 'mac' | 'connected', background?: boolean): void;
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
            Off by default. Uses controls tied to individual windows. Some apps and gestures are
            unsupported; turn this off for normal Mac control. Applies to the next request.
          </p>
        </div>
      ) : null}
      <p className={styles.settingsNote}>
        {computer.accessMode === 'mac'
          ? 'Sia uses native commands, AppleScript, files and screen images, like Notch. It uses the ordinary app interface and may bring apps forward. No Chrome connection is required. Full bypass runs commands without a workspace sandbox or per-action prompts. Allow Accessibility, Screen Recording and app Automation; complete sign-ins yourself.'
          : 'Connect Chrome or individual services for structured access. Choose Use my Mac to work through existing browser windows without attaching Chrome.'}
      </p>
    </div>
  );
}
