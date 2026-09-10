import { useEffect, useState } from 'react';
import { ArrowClockwise, Check, Copy, DeviceMobile, WifiHigh } from '@phosphor-icons/react';
import type {
  PhoneRemoteApi,
  PhoneRemoteSettings as Settings,
} from '../../../shared/phone-remote';
import { SettingsSectionHeader, InlineSettingsError } from './SettingsShared';
import styles from '../../ui.module.css';
import phone from './PhoneRemoteSettings.module.css';

export function PhoneRemoteSettings({
  api,
  agents,
}: {
  api: PhoneRemoteApi;
  agents: readonly { id: string; name: string }[];
}) {
  const [state, setState] = useState<Settings>();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    let initialized = false;
    const refresh = () =>
      api({ operation: 'status' })
        .then((next) => {
          if (active) {
            setState(next);
            if (!initialized && next.agentId) setAgentId(next.agentId);
            initialized = true;
          }
        })
        .catch(() => {
          if (active) setError('Phone remote could not be loaded.');
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  const run = async (operation: 'enable' | 'disable' | 'rotate') => {
    setPending(true);
    setError('');
    setCopied(false);
    try {
      setState(await api(operation === 'enable' ? { operation, agentId } : { operation }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Phone remote could not be updated.');
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingsSectionHeader
      title="Phone remote"
      description="Your assistant, wherever you are on the same Wi-Fi. No phone app or extra account needed."
    >
      <InlineSettingsError message={error} />
      <div className={phone.card}>
        <div className={phone.intro}>
          <span className={phone.mark}>
            <DeviceMobile size={25} />
          </span>
          <div>
            <h3>Take Sia with you</h3>
            <p>Send a request from your phone. Your Mac does the work.</p>
          </div>
          <span className={state?.running ? phone.live : phone.off}>
            <i />
            {state?.running ? 'Ready' : state?.enabled ? 'Waiting' : 'Off'}
          </span>
        </div>
        {!state?.enabled ? (
          <>
            <label className={phone.agent}>
              Assistant
              <select
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                disabled={pending}
              >
                {agents.map((agent) => (
                  <option value={agent.id} key={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={styles.primaryButton}
              disabled={pending || !agentId || !state}
              onClick={() => void run('enable')}
            >
              {pending ? 'Starting…' : 'Enable phone remote'}
            </button>
            <p className={phone.note}>
              macOS may ask for Local Network access. Choose Allow to connect your phone.
            </p>
          </>
        ) : (
          <>
            <div className={phone.pairing}>
              {state.qr ? (
                <div className={phone.qr}>
                  <img
                    src={state.qr}
                    alt="Scan this private QR code with your phone’s camera to control Sia"
                  />
                </div>
              ) : (
                <div className={phone.placeholder}>
                  <WifiHigh size={38} />
                  <p>{state.detail}</p>
                </div>
              )}
              <div className={phone.steps}>
                <span className={phone.eyebrow}>ONE SCAN. YOU’RE IN.</span>
                <h3>Meet Sia on your phone.</h3>
                <ol>
                  <li>Connect your phone to the same Wi-Fi as this Mac.</li>
                  <li>Scan this code with your phone’s camera.</li>
                  <li>Open the link and ask Sia to do something.</li>
                </ol>
                <p>In Safari, use Share → Add to Home Screen for a shortcut.</p>
              </div>
            </div>
            {state.url && (
              <div className={phone.link}>
                <code>{new URL(state.url).host}</code>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    void api({ operation: 'copy' })
                      .then(() => setCopied(true))
                      .catch(() =>
                        setError('Could not copy. Scan the QR code with your phone instead.'),
                      );
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy private link'}
                </button>
              </div>
            )}
            <p className={phone.note}>{state.detail}</p>
            <div className={phone.actions}>
              <button
                className={styles.secondaryButton}
                disabled={pending}
                onClick={() => void run('rotate')}
              >
                <ArrowClockwise size={15} />
                Create a new link
              </button>
              <button
                className={styles.textButtonDanger}
                disabled={pending}
                onClick={() => void run('disable')}
              >
                Turn off remote
              </button>
            </div>
          </>
        )}
      </div>
      <div className={phone.footnotes}>
        <p>
          <strong>The same Sia.</strong> Phone commands use this assistant’s model, Mac access,
          and action approval settings. Progress and replies stay in Sia’s conversation on this
          Mac.
        </p>
        <p>
          <strong>Your private link controls Sia.</strong> Keep it private and use trusted
          Wi-Fi. The local connection uses HTTP, like Notch; traffic is not encrypted. A new
          link disconnects previously paired phones.
        </p>
        <p>
          <strong>Keep your Mac available.</strong> Sia must stay open and your Mac awake and
          unlocked. Remote access pauses on lock or sleep. A Wi-Fi address change may require
          scanning again. Dictate using your phone’s keyboard microphone.
        </p>
      </div>
    </SettingsSectionHeader>
  );
}
