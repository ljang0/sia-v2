import { CaretRight, Check, DownloadSimple, ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { Fragment, useRef, useState } from 'react';
import type { RemoteTurn } from '../shared/phone-remote';
import { SiaMark } from '../renderer/components/SiaMark';
import { SafeMarkdown } from '../renderer/components/SafeMarkdown';
import { remoteBase, remoteTransport, saveRemoteFile } from './api';
import { ResultCard } from '../renderer/components/ResultCard';

export function Turn({
  turn,
  agent,
  onRate,
}: {
  turn: RemoteTurn;
  agent: string;
  /** Present on the owner's own phone: thumbs record a rating of this finished task. */
  onRate?: ((rating: 'good' | 'bad') => Promise<void>) | undefined;
}) {
  const saving = useRef(new Set<string>());
  const [downloads, setDownloads] = useState<Record<string, 'saving' | 'error' | undefined>>(
    {},
  );
  const save = async (route: string, file: string) => {
    if (saving.current.has(file)) return;
    saving.current.add(file);
    setDownloads((current) => ({ ...current, [file]: 'saving' }));
    try {
      await saveRemoteFile(route, file);
      setDownloads((current) => ({ ...current, [file]: undefined }));
    } catch {
      setDownloads((current) => ({ ...current, [file]: 'error' }));
    } finally {
      saving.current.delete(file);
    }
  };
  const finished =
    turn.status === 'done' && !turn.error && Boolean(turn.response.trim() || turn.files.length);
  const result = (
    <>
      {turn.response && (
        <div className="remote-response" data-streaming={turn.streaming || undefined}>
          <SafeMarkdown content={turn.response} />
        </div>
      )}
      {turn.files.map((file) => {
        const route = turn.fileIds?.[file]
          ? `results/${encodeURIComponent(turn.fileIds[file])}`
          : `outbox/${encodeURIComponent(file)}`;
        return (
          <Fragment key={file}>
            <a
              className="result-file"
              href={new URL(route, remoteBase).href}
              download={file}
              aria-busy={downloads[file] === 'saving' || undefined}
              aria-disabled={downloads[file] === 'saving' || undefined}
              onClick={(event) => {
                if (remoteTransport === 'wifi') return;
                // Over the relay, the file arrives sealed and is saved from memory.
                event.preventDefault();
                void save(route, file);
              }}
            >
              <DownloadSimple size={22} />
              <span>{file}</span>
              <span className="muted">{downloads[file] === 'saving' ? 'Saving…' : 'Save'}</span>
            </a>
            {downloads[file] === 'error' && (
              <p className="download-error" role="alert">
                This file couldn’t be saved. Check your connection, then{' '}
                <button type="button" onClick={() => void save(route, file)}>
                  try again
                </button>
                .
              </p>
            )}
          </Fragment>
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
        <details className="task-steps" data-live={turn.status === 'working' || undefined}>
          <summary>
            <CaretRight className="steps-caret" size={16} weight="bold" aria-hidden="true" />
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
      {turn.rateable && onRate ? <TurnRating turn={turn} onRate={onRate} /> : null}
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

function TurnRating({
  turn,
  onRate,
}: {
  turn: RemoteTurn;
  onRate(rating: 'good' | 'bad'): Promise<void>;
}) {
  const [chosen, setChosen] = useState(turn.rating);
  const [saved, setSaved] = useState(false);
  const rate = (rating: 'good' | 'bad') => {
    const previous = chosen;
    setChosen(rating);
    setSaved(false);
    void onRate(rating).then(
      () => setSaved(true),
      () => setChosen(previous),
    );
  };
  const current = chosen ?? turn.rating;
  return (
    <div className="turn-rating" role="group" aria-label="Rate this task">
      <span>{saved ? 'Thanks, saved.' : 'How did it go?'}</span>
      <button
        type="button"
        aria-label="Good result"
        aria-pressed={current === 'good'}
        onClick={() => rate('good')}
      >
        <ThumbsUp
          size={22}
          weight={current === 'good' ? 'fill' : 'regular'}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        aria-label="Bad result"
        aria-pressed={current === 'bad'}
        onClick={() => rate('bad')}
      >
        <ThumbsDown
          size={22}
          weight={current === 'bad' ? 'fill' : 'regular'}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
