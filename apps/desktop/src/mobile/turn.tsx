import { Check, DownloadSimple } from '@phosphor-icons/react';
import type { RemoteTurn } from '../shared/phone-remote';
import { SiaMark } from '../renderer/components/SiaMark';
import { SafeMarkdown } from '../renderer/components/SafeMarkdown';
import { remoteBase, remoteTransport, saveRemoteFile } from './api';
import { ResultCard } from '../renderer/components/ResultCard';

export function Turn({ turn, agent }: { turn: RemoteTurn; agent: string }) {
  const finished =
    turn.status === 'done' && !turn.error && Boolean(turn.response.trim() || turn.files.length);
  const result = (
    <>
      {turn.response && (
        <div className="remote-response">
          <SafeMarkdown content={turn.response} />
        </div>
      )}
      {turn.files.map((file) => {
        const route = turn.fileIds?.[file]
          ? `results/${encodeURIComponent(turn.fileIds[file])}`
          : `outbox/${encodeURIComponent(file)}`;
        return (
          <a
            className="result-file"
            href={new URL(route, remoteBase).href}
            download={file}
            key={file}
            onClick={(event) => {
              if (remoteTransport === 'wifi') return;
              // Over the relay, the file arrives sealed and is saved from memory.
              event.preventDefault();
              void saveRemoteFile(route, file).catch((cause: unknown) =>
                window.alert(
                  cause instanceof Error ? cause.message : 'This file could not be saved.',
                ),
              );
            }}
          >
            <DownloadSimple size={22} />
            <span>{file}</span>
            <span className="muted">Save</span>
          </a>
        );
      })}
    </>
  );
  return (
    <section className="remote-turn" id={`turn-${turn.id}`}>
      <div className="user-message">{turn.text}</div>
      <div className="assistant-heading">
        <SiaMark state={turn.status === 'working' ? 'working' : 'idle'} />
        <strong>{agent}</strong>
        {/* Keyed by status so each change lands with its own transition instead of a silent swap. */}
        <span className="turn-status" data-status={turn.status} key={turn.status}>
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
              <Check size={16} aria-hidden="true" />
              Finished
            </>
          )}
        </span>
      </div>
      {turn.steps.length > 0 && (
        <details className="task-steps">
          <summary>
            <span
              className="step-line"
              key={turn.status === 'working' ? turn.steps.length : 'all'}
            >
              {turn.status === 'working'
                ? turn.steps.at(-1)
                : `What Sia did (${turn.steps.length} ${turn.steps.length === 1 ? 'step' : 'steps'})`}
            </span>
          </summary>
          <ol>
            {turn.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </details>
      )}
      {finished ? <ResultCard>{result}</ResultCard> : result}
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
        <p className="waiting-note" data-kind={turn.approval ? 'approval' : 'question'}>
          {turn.approval && turn.approvalId
            ? `Waiting for your OK: “${turn.approval}”. Allow or deny it here or in Sia on your Mac.`
            : turn.approval
              ? `Waiting for your OK on your Mac: “${turn.approval}”. Approve or deny it in Sia on your Mac, or stop the task here.`
              : 'Reply below to answer Sia.'}
        </p>
      )}
    </section>
  );
}
