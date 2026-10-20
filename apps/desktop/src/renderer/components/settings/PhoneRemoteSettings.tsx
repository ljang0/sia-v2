import { useEffect, useState } from 'react';
import { ArrowClockwise, Check, Copy, DeviceMobile, WifiHigh } from '@phosphor-icons/react';
import type {
  PhoneRemoteApi,
  PhoneRemoteSettings as Settings,
} from '../../../shared/phone-remote';
import { phoneAssistantBlocker } from '../../../shared/phone-remote';
import type { AgentView } from '../../../shared/bridge';
import type { ProviderSetup } from '../../types';
import type { MessagesRelayApi } from '../../../shared/messages-relay';
import { SettingsSectionHeader, InlineSettingsError } from './SettingsShared';
import { TextSiaSettings } from './TextSiaSettings';
import buttons from '../../styles/buttons.module.css';
import primitives from '../../styles/primitives.module.css';
import phone from './PhoneRemoteSettings.module.css';
import { errorMessage } from '../../plainErrors';

export function PhoneRemoteSettings({
  api,
  messagesApi,
  agents,
  providers,
}: {
  api: PhoneRemoteApi;
  messagesApi?: MessagesRelayApi | undefined;
  agents: readonly Pick<AgentView, 'id' | 'name' | 'provider' | 'model'>[];
  providers: readonly ProviderSetup[];
}) {
  const [state, setState] = useState<Settings>();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const pairedAgent = agents.find((agent) => agent.id === state?.agentId);
  const blocker = state?.enabled ? phoneAssistantBlocker(pairedAgent, providers) : undefined;
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
  const run = async (
    operation: 'enable' | 'disable' | 'rotate' | 'pair' | 'revoke',
    deviceId?: string,
  ) => {
    setPending(true);
    setError('');
    setCopied(false);
    try {
      setState(
        await api(
          operation === 'enable'
            ? { operation, agentId }
            : operation === 'revoke'
              ? { operation, deviceId: deviceId! }
              : { operation },
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Phone remote could not be updated.'));
    } finally {
      setPending(false);
    }
  };
  const relay = state?.relay;
  // Until the first status arrives, placeholders hold the card's shape instead of showing "Off".
  const loading = !state && !error;
  return (
    <SettingsSectionHeader
      title="Phone remote"
      description={
        relay
          ? 'Control Sia from your phone, from any network. Messages are encrypted end to end.'
          : 'Preview: control Sia from a phone on your trusted local network.'
      }
    >
      <InlineSettingsError message={error} />
      <div className={phone.card}>
        <div className={phone.intro}>
          <span className={phone.mark}>
            <DeviceMobile size={24} />
          </span>
          <div>
            <h3>Take Sia with you</h3>
            <p>Send a request from your phone. Your Mac does the work.</p>
          </div>
          {loading ? (
            <span className={`${primitives.skeleton} ${phone.statusSkeleton}`} />
          ) : (
            <span className={state?.running ? phone.live : phone.off}>
              <i />
              {state?.running ? 'Ready' : state?.enabled ? 'Waiting' : 'Off'}
            </span>
          )}
        </div>
        {loading ? (
          <div className={phone.loading} role="status" aria-label="Checking phone remote">
            <span className={`${primitives.skeleton} ${phone.lineSkeleton}`} />
            <span className={`${primitives.skeleton} ${phone.buttonSkeleton}`} />
          </div>
        ) : !state?.enabled ? (
          <>
            <label className={phone.agent}>
              Assistant
              <select
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                disabled={pending || agents.length === 0}
              >
                {agents.length === 0 && <option value="">No assistants yet</option>}
                {agents.map((agent) => (
                  <option value={agent.id} key={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            {agents.length === 0 && (
              <p className={phone.note}>
                Set up an assistant in Sia before connecting your phone.
              </p>
            )}
            <button
              className={buttons.primaryButton}
              disabled={pending || !agentId || !state}
              onClick={() => void run('enable')}
            >
              {pending ? 'Starting…' : 'Enable phone remote'}
            </button>
            {!relay && (
              <p className={phone.note}>
                macOS may ask for Local Network access. Choose Allow to connect your phone.
              </p>
            )}
          </>
        ) : relay ? (
          <RelayPairing
            relay={relay}
            detail={state.detail}
            pending={pending}
            onPair={() => void run('pair')}
            onRevoke={(deviceId) => void run('revoke', deviceId)}
            onDisable={() => void run('disable')}
          />
        ) : (
          <>
            {pairedAgent && (
              <p className={phone.note}>
                This phone uses {pairedAgent.name} · {modelLabel(pairedAgent, providers)}.
              </p>
            )}
            <InlineSettingsError message={blocker ?? ''} />
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
            {agentId !== state.agentId && (
              <>
                <button
                  className={buttons.secondaryButton}
                  disabled={pending || !agentId}
                  onClick={() => void run('enable')}
                >
                  {pending ? 'Switching…' : 'Switch assistant'}
                </button>
                <p className={phone.note}>
                  Switching creates a new private link. Scan its QR code on your phone again.
                </p>
              </>
            )}
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
                <span className={phone.eyebrow}>One scan and you’re in.</span>
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
                  className={buttons.secondaryButton}
                  onClick={() => {
                    void api({ operation: 'copy' })
                      .then(() => setCopied(true))
                      .catch(() =>
                        setError('Could not copy. Scan the QR code with your phone instead.'),
                      );
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy private link'}
                </button>
              </div>
            )}
            <p className={phone.note}>{state.detail}</p>
            <div className={phone.actions}>
              <button
                className={buttons.secondaryButton}
                disabled={pending}
                onClick={() => void run('rotate')}
              >
                <ArrowClockwise size={16} />
                Create a new link
              </button>
              <button
                className={buttons.textButtonDanger}
                disabled={pending}
                onClick={() => void run('disable')}
              >
                Turn off remote
              </button>
            </div>
          </>
        )}
      </div>
      {messagesApi && <TextSiaSettings api={messagesApi} agents={agents} />}
      {relay ? (
        <div className={phone.footnotes}>
          <p>
            <strong>The same Sia, with you in charge.</strong> Phone requests use this
            assistant’s model and Mac access. Each step a phone request takes asks for your OK
            here on the Mac, one at a time.
          </p>
          <p>
            <strong>Encrypted end to end.</strong> Your phone and this Mac share a key from the
            pairing code. Sia’s servers pass sealed messages along and cannot read them. Remove
            a phone here to cut it off at once.
          </p>
          <p>
            <strong>Keep your Mac available.</strong> Sia must stay open and your Mac awake and
            unlocked. Phone access pauses on lock or sleep.
          </p>
        </div>
      ) : (
        <div className={phone.footnotes}>
          <p>
            <strong>The same Sia, with you in charge.</strong> Phone requests use this
            assistant’s model and Mac access. Each step a phone request takes asks for your OK
            here on the Mac, one at a time. Progress and replies stay in Sia’s conversation on
            this Mac.
          </p>
          <p>
            <strong>Your private link controls Sia.</strong> Keep it private and use trusted
            Wi-Fi. The local connection is not encrypted. A new link disconnects previously
            paired phones.
          </p>
          <p>
            <strong>Keep your Mac available.</strong> Sia must stay open and your Mac awake and
            unlocked. Remote access pauses on lock or sleep. A Wi-Fi address change may require
            scanning again. Dictate using your phone’s keyboard microphone.
          </p>
        </div>
      )}
    </SettingsSectionHeader>
  );
}

/** Pairing and paired phones for the encrypted relay. */
function RelayPairing({
  relay,
  detail,
  pending,
  onPair,
  onRevoke,
  onDisable,
}: {
  relay: NonNullable<Settings['relay']>;
  detail: string;
  pending: boolean;
  onPair(): void;
  onRevoke(deviceId: string): void;
  onDisable(): void;
}) {
  return (
    <>
      <div className={phone.pairing}>
        {relay.pairingQr ? (
          <div className={phone.qr}>
            <img
              src={relay.pairingQr}
              alt="Scan this one-time QR code with your phone’s camera to pair it with Sia"
            />
          </div>
        ) : (
          <div className={phone.placeholder}>
            <DeviceMobile size={38} />
            <p>{relay.connected ? 'Add a phone to get a one-time pairing code.' : detail}</p>
          </div>
        )}
        <div className={phone.steps}>
          <span className={phone.eyebrow}>PAIR ONCE. USE ANYWHERE.</span>
          <h3>Meet Sia on your phone.</h3>
          <ol>
            <li>Choose Pair a phone.</li>
            <li>Scan the code with your phone’s camera.</li>
            <li>Ask Sia from Wi-Fi or cellular. This Mac does the work.</li>
          </ol>
          <p>In Safari, use Share → Add to Home Screen for a shortcut.</p>
        </div>
      </div>
      {relay.devices.length > 0 && (
        <ul className={phone.devices} aria-label="Paired phones">
          {relay.devices.map((device, index) => (
            <li key={device.deviceId}>
              <span>
                Phone {index + 1} · paired {new Date(device.pairedAt).toLocaleDateString()}
                {device.online ? ' · connected' : ''}
              </span>
              <button
                className={buttons.textButtonDanger}
                disabled={pending}
                onClick={() => onRevoke(device.deviceId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={phone.note}>{detail}</p>
      <div className={phone.actions}>
        <button
          className={buttons.primaryButton}
          disabled={pending || !relay.connected}
          onClick={onPair}
        >
          {pending ? 'Working…' : 'Pair a phone'}
        </button>
        <button className={buttons.textButtonDanger} disabled={pending} onClick={onDisable}>
          Turn off phone access
        </button>
      </div>
    </>
  );
}

/** The model's catalog name ("GPT-6 Astra"), falling back to its id when the catalog has none. */
function modelLabel(
  agent: Pick<AgentView, 'provider' | 'model'>,
  providers: readonly ProviderSetup[],
): string | undefined {
  return (
    providers
      .find((provider) => provider.id === agent.provider)
      ?.models?.find((model) => model.id === agent.model)?.label ?? agent.model
  );
}
