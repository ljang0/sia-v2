import type { RendererSnapshot } from '../types';
import styles from '../ui.module.css';
import modeStyles from './ComputerAccessMode.module.css';

export function ComputerAccessMode({
  computer,
  disabled,
  change,
}: {
  computer: RendererSnapshot['computer'];
  disabled?: boolean | undefined;
  change(mode: 'mac' | 'connected'): void;
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
      <p className={styles.settingsNote}>
        {computer.accessMode === 'mac'
          ? 'Sia uses native commands, AppleScript, file access and screen images, like Notch. No Chrome connection is required. Full bypass runs commands without a workspace sandbox or per-action prompts. Allow Accessibility, Screen Recording and app Automation; complete sign-ins yourself.'
          : 'Connect Chrome or individual services for structured access. Choose Use my Mac to work through existing browser windows without attaching Chrome.'}
      </p>
    </div>
  );
}
