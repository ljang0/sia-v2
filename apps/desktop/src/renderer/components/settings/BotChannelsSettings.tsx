import type { MessagesRelayApi, MessagesRelaySettings } from '../../../shared/messages-relay';
import buttons from '../../styles/buttons.module.css';
import phone from './PhoneRemoteSettings.module.css';

const CHANNELS = [
  {
    kind: 'telegram' as const,
    name: 'Telegram',
    steps: 'In Telegram, message @BotFather, send /newbot and copy the token it gives you.',
  },
  {
    kind: 'discord' as const,
    name: 'Discord',
    steps:
      'In the Discord Developer Portal, create an application, open Bot, reset and copy its token. Add the bot to a server you are in so you can message it directly.',
  },
];

/** Message Sia on Telegram or Discord through a bot you own, paired to your account by code. */
export function BotChannelsSettings({
  state,
  pending,
  run,
}: {
  state: MessagesRelaySettings;
  pending: boolean;
  run: (command: Parameters<MessagesRelayApi>[0]) => Promise<boolean>;
}) {
  return (
    <section aria-label="Other messaging apps" className={phone.people}>
      <span className={phone.eyebrow}>TELEGRAM AND DISCORD</span>
      {CHANNELS.map((channel) => {
        const connected = state.bots.find((bot) => bot.kind === channel.kind);
        return (
          <div key={channel.kind} className={phone.channel}>
            <strong>{channel.name}</strong>
            {connected ? (
              <>
                <p className={phone.note}>
                  Connected to {connected.bot}.{' '}
                  {connected.pairingCode
                    ? `Message the bot this code to link your account: ${connected.pairingCode}`
                    : 'Linked accounts appear under Your numbers.'}
                </p>
                {connected.error && <p className={phone.note}>{connected.error}</p>}
                <button
                  className={buttons.textButtonDanger}
                  disabled={pending}
                  onClick={() => void run({ operation: 'disconnectBot', kind: channel.kind })}
                >
                  Disconnect {channel.name}
                </button>
              </>
            ) : (
              <>
                <p className={phone.note}>
                  {channel.steps} Sia reads the token from your clipboard, keeps it encrypted on
                  this Mac and clears the clipboard.
                </p>
                <button
                  className={buttons.secondaryButton}
                  disabled={pending}
                  onClick={() => void run({ operation: 'connectBot', kind: channel.kind })}
                >
                  Paste {channel.name} token
                </button>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
