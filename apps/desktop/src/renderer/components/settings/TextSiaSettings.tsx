import { useEffect, useState } from 'react';
import { ChatCircleText, X } from '@phosphor-icons/react';
import type { MessagesRelayApi, MessagesRelaySettings } from '../../../shared/messages-relay';
import { InlineSettingsError } from './SettingsShared';
import { TrustedPeopleSettings } from './TrustedPeopleSettings';
import { errorMessage } from '../../plainErrors';
import buttons from '../../styles/buttons.module.css';
import phone from './PhoneRemoteSettings.module.css';

/** Text Sia from anywhere through this Mac's Messages app, from the person's own numbers. */
export function TextSiaSettings({
  api,
  agents,
}: {
  api: MessagesRelayApi;
  agents: readonly { id: string; name: string }[];
}) {
  const [state, setState] = useState<MessagesRelaySettings>();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [handle, setHandle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let initialized = false;
    const refresh = () =>
      api({ operation: 'status' })
        .then((next) => {
          if (!active) return;
          setState(next);
          if (!initialized && next.agentId) setAgentId(next.agentId);
          initialized = true;
        })
        .catch(() => {
          if (active) setError('Texting settings could not be loaded.');
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  const run = async (command: Parameters<MessagesRelayApi>[0]) => {
    setPending(true);
    setError('');
    try {
      setState(await api(command));
      return true;
    } catch (cause) {
      setError(errorMessage(cause, 'Texting settings could not be updated.'));
      return false;
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={`${phone.card} ${phone.textCard}`}>
      <div className={phone.intro}>
        <span className={phone.mark}>
          <ChatCircleText size={25} />
        </span>
        <div>
          <h3>Text Sia from anywhere</h3>
          <p>Send a text from your phone. Sia replies in the same conversation.</p>
        </div>
        <span className={state?.running ? phone.live : phone.off}>
          <i />
          {state?.running ? 'Ready' : state?.enabled ? 'Waiting' : 'Off'}
        </span>
      </div>
      <InlineSettingsError message={error} />
      <span className={phone.eyebrow}>YOUR NUMBERS</span>
      <ul aria-label="Your numbers" className={phone.numbers}>
        {state?.trusted.map((contact) => (
          <li key={contact.handle}>
            <code>{contact.handle}</code>
            <button
              className={buttons.textButtonDanger}
              aria-label={`Remove ${contact.handle}`}
              disabled={pending}
              onClick={() => void run({ operation: 'untrust', handle: contact.handle })}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className={`${phone.link} ${phone.numberForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          void run({ operation: 'trust', handle, label: '' }).then((ok) => {
            if (ok) setHandle('');
          });
        }}
      >
        <input
          aria-label="Phone number or iCloud email"
          placeholder="Your phone number or iCloud email"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        />
        <button className={buttons.secondaryButton} disabled={pending || !handle.trim()}>
          Add
        </button>
      </form>
      {!state?.enabled ? (
        <>
          <label className={phone.agent}>
            Assistant for texts
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              disabled={pending || agents.length === 0}
            >
              {agents.map((agent) => (
                <option value={agent.id} key={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className={buttons.primaryButton}
            disabled={pending || !agentId || !state?.trusted.length}
            onClick={() => void run({ operation: 'enable', agentId })}
          >
            {pending ? 'Turning on…' : 'Turn on texting'}
          </button>
        </>
      ) : (
        <div className={phone.actions}>
          <button
            className={buttons.textButtonDanger}
            disabled={pending}
            onClick={() => void run({ operation: 'disable' })}
          >
            Turn off texting
          </button>
        </div>
      )}
      {state && (
        <label className={phone.toggle}>
          <input
            type="checkbox"
            checked={state.proactive}
            disabled={pending}
            onChange={(event) =>
              void run({ operation: 'preferences', proactive: event.target.checked })
            }
          />
          Text me when scheduled tasks finish or need me
        </label>
      )}
      {state && (
        <label className={phone.toggle}>
          <input
            type="checkbox"
            checked={state.textApprovals}
            disabled={pending}
            onChange={(event) =>
              void run({ operation: 'preferences', textApprovals: event.target.checked })
            }
          />
          Approve steps by replying YES or NO
        </label>
      )}
      {state && <p className={phone.note}>{state.detail}</p>}
      {state && <TrustedPeopleSettings state={state} pending={pending} run={run} />}
      <p className={phone.note}>
        Only iMessages from your numbers reach Sia. Anything that changes your Mac or accounts
        waits for your OK, one step at a time, even when bypass is on. Text STOP to cancel or
        NEW to start over. Sia must stay open and your Mac awake.
      </p>
    </div>
  );
}
