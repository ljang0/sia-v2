import { useEffect, useState } from 'react';
import { ArrowCounterClockwise, PawPrint } from '@phosphor-icons/react';
import type {
  ScottyCommand,
  ScottySettings as Settings,
  ScottySettingsApi,
} from '../../../shared/scotty';
import { SettingsSectionHeader, InlineSettingsError } from './SettingsShared';
import { ScottySprite } from '../ScottySprite';
import styles from '../../ui.module.css';
import pet from './ScottySettings.module.css';
import { Switch } from '../Switch';
export function ScottySettings({ api }: { api: ScottySettingsApi }) {
  const [state, setState] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api({ operation: 'status' })
        .then((next) => {
          if (active) setState(next);
        })
        .catch(() => {
          if (active) setError('Scotty could not be loaded.');
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [api]);
  const run = async (command: ScottyCommand) => {
    setBusy(true);
    setError('');
    try {
      setState(await api(command));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scotty could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSectionHeader title="Meet Scotty" description="A little company while Sia works.">
      <InlineSettingsError message={error} />
      <div className={pet.card}>
        <div className={pet.hero}>
          <div className={pet.preview}>
            <ScottySprite
              pose={state?.enabled ? 'happy' : 'idle'}
              size={112}
              motion={state?.motion ?? true}
            />
          </div>
          <span className={pet.name}>
            <PawPrint size={13} /> YOUR DESKTOP COMPANION
          </span>
          <h3>Keep Sia within reach</h3>
          <p>
            Follow your tasks and answer Sia from your desktop. Drag Scotty wherever you like.
          </p>
          <button
            className={styles.primaryButton}
            disabled={busy || !state}
            onClick={() => void run({ operation: state?.enabled ? 'hide' : 'show' })}
          >
            {busy ? 'Updating…' : state?.enabled ? 'Hide Scotty' : 'Bring Scotty to my desktop'}
          </button>
        </div>
        <div className={pet.controls}>
          <div className={pet.row}>
            <div>
              <strong>Pet size</strong>
              <p>Find the right amount of company.</p>
            </div>
            <select
              aria-label="Scotty size"
              disabled={busy || !state}
              value={state?.size ?? 'medium'}
              onChange={(event) =>
                void run({ operation: 'size', size: event.target.value as Settings['size'] })
              }
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <label className={pet.row}>
            <div>
              <strong>Animations</strong>
              <p>Blinks, sniffs, naps, and a happy little hop.</p>
            </div>
            <Switch
              aria-label="Scotty animations"
              checked={state?.motion ?? true}
              disabled={busy || !state}
              onChange={(event) =>
                void run({ operation: 'motion', enabled: event.target.checked })
              }
            />
          </label>
          <div className={pet.row}>
            <div>
              <strong>Lost Scotty?</strong>
              <p>Bring him back to this screen.</p>
            </div>
            <button
              className={styles.secondaryButton}
              disabled={busy || !state}
              onClick={() => void run({ operation: 'resetPosition' })}
            >
              <ArrowCounterClockwise size={14} /> Reset position
            </button>
          </div>
        </div>
      </div>
      <p className={pet.note}>
        Scotty lives entirely in Sia and follows your existing agents. He remembers his spot,
        respects Reduced Motion, and hides when your Mac locks. Sia must stay open. Show him
        anytime from the Sia menu → Show Scotty.
      </p>
    </SettingsSectionHeader>
  );
}
