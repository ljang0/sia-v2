import type {
  AssistantLibraryView,
  AssistantLibraryCommand,
} from '../../../shared/assistant-library';
import styles from './AssistantSettings.module.css';
export function MemorySuggestions({
  library,
  agentId,
  command,
}: {
  library: AssistantLibraryView;
  agentId: string;
  command(input: AssistantLibraryCommand): Promise<boolean>;
}) {
  const suggestions = (library.suggestions ?? []).filter((entry) => entry.agentId === agentId);
  const learning = library.learningAgents?.includes(agentId) ?? false;
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h3>Suggested improvements</h3>
          {suggestions.length > 0 && (
            <p>
              {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'} to
              review
            </p>
          )}
          <p>
            Combine useful lessons, retire outdated advice, and turn repeated work into skills.
          </p>
        </div>
        <button
          disabled={!learning}
          onClick={() => void command({ operation: 'review', agentId })}
        >
          Find improvements
        </button>
      </div>
      <label className={styles.toggle}>
        <span>
          <strong>Review memory in the background</strong>
          <small>
            Uses your agent’s model plan for one review when idle, at most every six hours and
            only after new completed tasks. Reviews can propose changes but cannot operate apps
            or run scripts. Turn this off to stop background reviews.
          </small>
        </span>
        <input
          type="checkbox"
          disabled={!learning}
          checked={library.reviewAgents?.includes(agentId) ?? false}
          onChange={(event) =>
            void command({
              operation: 'backgroundReview',
              agentId,
              enabled: event.target.checked,
            })
          }
        />
      </label>
      <p className={styles.note}>
        Find improvements also uses a model turn. Every change waits for your review. Saved
        skills run only when requested, with the usual approvals.
      </p>
      {!suggestions.length && (
        <p className={styles.empty}>
          No suggestions waiting. Sia needs completed-task evidence before proposing a change.
        </p>
      )}
      {suggestions.map((entry) => (
        <article key={entry.id} className={styles.card}>
          <div>
            <small>
              {entry.kind === 'merge'
                ? 'Combine memories'
                : entry.kind === 'retire'
                  ? 'Retire memory'
                  : 'New executable skill'}
            </small>
            <h4>{entry.title}</h4>
            <p>{entry.reason}</p>
          </div>
          {entry.memories.length > 0 && (
            <div>
              <strong>Current memory</strong>
              {entry.memories.map((memory) => (
                <p key={memory.id}>
                  {memory.title}: {memory.text}
                  {!memory.enabled && ' (paused)'}
                </p>
              ))}
            </div>
          )}
          {entry.kind === 'merge' && (
            <div>
              <strong>Proposed memory</strong>
              <p>{entry.text}</p>
            </div>
          )}
          {entry.kind === 'retire' && <p>This memory will be removed from future requests.</p>}
          {entry.kind === 'skill' && (
            <div>
              <p>{entry.description}</p>
              <strong>Complete Bash source</strong>
              <pre className={styles.source}>{entry.source}</pre>
            </div>
          )}
          <details>
            <summary>
              Evidence from {new Set(entry.evidence.map((item) => item.turnId)).size} completed
              tasks
            </summary>
            {entry.evidence.map((item) => (
              <p key={item.id}>
                {new Date(item.timestamp).toLocaleString()} · {item.title}: {item.text}
              </p>
            ))}
          </details>
          <div className={styles.actions}>
            <button
              onClick={() =>
                void command({
                  operation: 'resolveSuggestion',
                  id: entry.id,
                  revision: entry.revision,
                  accept: true,
                })
              }
            >
              {entry.kind === 'skill' ? 'Accept and save skill' : 'Accept change'}
            </button>
            <button
              onClick={() =>
                void command({
                  operation: 'resolveSuggestion',
                  id: entry.id,
                  revision: entry.revision,
                  accept: false,
                })
              }
            >
              Dismiss suggestion
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
