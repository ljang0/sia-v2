import { Check, DownloadSimple } from '@phosphor-icons/react';
import type { RemoteTurn } from '../shared/phone-remote';
import { SiaMark } from '../renderer/components/SiaMark';
import { SafeMarkdown } from '../renderer/components/SafeMarkdown';
import { remoteBase } from './api';

export function Turn({ turn, agent }: { turn: RemoteTurn; agent: string }) {
  return (
    <section className="remote-turn" id={`turn-${turn.id}`}>
      <div className="user-message">{turn.text}</div>
      <div className="assistant-heading">
        <SiaMark state={turn.status === 'working' ? 'working' : 'idle'} />
        <strong>{agent}</strong>
        <span className="turn-status" data-status={turn.status}>
          {turn.status === 'working' ? (
            <>
              <span className="working-dot" />
              Working
            </>
          ) : turn.status === 'waiting' ? (
            'Needs you'
          ) : turn.status === 'cancelled' ? (
            'Stopped'
          ) : turn.status === 'error' ? (
            'Needs attention'
          ) : (
            <>
              <Check size={13} />
              Finished
            </>
          )}
        </span>
      </div>
      {turn.steps.length > 0 && (
        <details className="task-steps">
          <summary>
            {turn.status === 'working'
              ? turn.steps.at(-1)
              : `${turn.steps.length} ${turn.steps.length === 1 ? 'step' : 'steps'}`}
          </summary>
          <ol>
            {turn.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </details>
      )}
      {turn.response && (
        <div className="remote-response">
          <SafeMarkdown content={turn.response} />
        </div>
      )}
      {turn.status === 'working' && !turn.response && (
        <div className="thinking-dots" aria-label="Sia is thinking">
          <i />
          <i />
          <i />
        </div>
      )}
      {turn.error && !turn.response.includes(turn.error.trim()) && (
        <p className="task-error">{turn.error}</p>
      )}
      {turn.status === 'waiting' && (
        <p className="waiting-note">
          Reply below if Sia asked a question. Approve computer actions in Sia on your Mac.
        </p>
      )}
      {turn.files.map((file) => (
        <a
          className="result-file"
          href={new URL(`outbox/${encodeURIComponent(file)}`, remoteBase).href}
          download={file}
          key={file}
        >
          <DownloadSimple size={19} />
          <span>{file}</span>
          <span className="muted">Save</span>
        </a>
      ))}
    </section>
  );
}
