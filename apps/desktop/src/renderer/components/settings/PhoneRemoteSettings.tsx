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
  const run = async (operation: 'enable' | 'disable' | 'rotate') => {
    setPending(true);
    setError('');
    setCopied(false);
    try {
      setState(await api(operation === 'enable' ? { operation, agentId } : { operation }));
    } catch (cause) {
      setError(errorMessage(cause, 'Phone remote could not be updated.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingsSectionHeader
      title="Phone remote"
      description="Preview: control Sia from a phone on your trusted local network."
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
            <p className={phone.note}>
              macOS may ask for Local Network access. Choose Allow to connect your phone.
            </p>
          </>
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
                  className={buttons.secondaryButton}
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
                className={buttons.secondaryButton}
                disabled={pending}
                onClick={() => void run('rotate')}
              >
                <ArrowClockwise size={15} />
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
      <div className={phone.footnotes}>
        <p>
          <strong>The same Sia, with you in charge.</strong> Phone requests use this assistant’s
          model and Mac access. Each step a phone request takes asks for your OK here on the
          Mac, one at a time. Progress and replies stay in Sia’s conversation on this Mac.
        </p>
        <p>
          <strong>Your private link controls Sia.</strong> Keep it private and use trusted
          Wi-Fi. The local connection is not encrypted. A new link disconnects previously paired
          phones.
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
