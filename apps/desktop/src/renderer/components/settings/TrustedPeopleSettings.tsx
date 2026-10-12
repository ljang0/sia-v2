import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { MessagesRelayApi, MessagesRelaySettings } from '../../../shared/messages-relay';
import buttons from '../../styles/buttons.module.css';
import phone from './PhoneRemoteSettings.module.css';

/** Instinct-style trusted people: other Sia users whose assistants may message yours. */
export function TrustedPeopleSettings({
  state,
  pending,
  run,
}: {
  state: MessagesRelaySettings;
  pending: boolean;
  run: (command: Parameters<MessagesRelayApi>[0]) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  return (
    <section aria-label="Trusted people" className={phone.people}>
      <span className={phone.eyebrow}>TRUSTED PEOPLE</span>
      <p className={phone.note}>
        Your Sia can exchange messages with the Sia of people you add, for example to find a
        time to meet. They need to add you too. Their messages never run with full bypass, and
        you approve every reply your Sia sends them.
      </p>
      <ul aria-label="Trusted people list" className={phone.numbers}>
        {state.people.map((person) => (
          <li key={person.handle}>
            <span>{person.name}</span>
            <code>{person.handle}</code>
            <button
              className={buttons.textButtonDanger}
              aria-label={`Remove ${person.name}`}
              disabled={pending}
              onClick={() => void run({ operation: 'removePerson', handle: person.handle })}
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
          void run({ operation: 'addPerson', handle, name }).then((ok) => {
            if (ok) {
              setName('');
              setHandle('');
            }
          });
        }}
      >
        <input
          aria-label="Their name"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          aria-label="Their phone number or iCloud email"
          placeholder="Phone number or iCloud email"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        />
        <button
          className={buttons.secondaryButton}
          disabled={pending || !name.trim() || !handle.trim()}
        >
          Add person
        </button>
      </form>
      {state.people.length > 0 && (
        <label className={phone.toggle}>
          <input
            type="checkbox"
            checked={state.peoplePaused}
            disabled={pending}
            onChange={(event) =>
              void run({ operation: 'pausePeople', paused: event.target.checked })
            }
          />
          Pause connections
        </label>
      )}
    </section>
  );
}
