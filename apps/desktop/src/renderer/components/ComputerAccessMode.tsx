import { useId } from 'react';
import type { RendererSnapshot } from '../types';
import settings from './settings/SettingsShared.module.css';
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
    <div className={settings.accessGroup}>
      <div className={modeStyles.row}>
        <div>
          <strong>How Sia uses your apps</strong>
          <p>Use your Mac apps directly, or limit tasks to connected services.</p>
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
                  checked={computer.backgroundControl === true}
                  onChange={() => change('mac', true)}
                />
                <span>
                  <strong>Work in background</strong>
                  <span>Keep working in other apps. Some steps may need your screen.</span>
                </span>
              </label>
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
                    Sia takes over your screen. Use this if a task needs full app and file
                    control.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
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
        </div>
      ) : null}
      <p className={settings.settingsNote}>
        {computer.accessMode === 'mac'
          ? computer.backgroundControl
            ? computer.backgroundFallback === 'foreground'
              ? 'Sia works in the background and can briefly bring an app forward to finish a step, such as typing. Saved Mac scripts need On my screen. Changes apply to your next task.'
              : 'Sia uses apps and documents you already have open. It pauses if you are using the app it needs, focus changes, or a step needs your screen. Saved Mac scripts need On my screen. Changes apply to your next task.'
            : 'Sia can control your apps and files. With Act without asking on, Sia’s Mac commands have full access to your Mac. Changes apply to your next task.'
          : 'Connect your accounts in Connections. To let Sia use the apps on your Mac, choose Use my Mac.'}
      </p>
    </div>
  );
}
