import { useState } from 'react';
import type {
  AssistantLibraryCommand,
  AssistantLibraryView,
  AssistantSkill,
} from '../../../shared/assistant-library';
import styles from './AssistantSettings.module.css';

export function ExecutableSkills({
  library,
  agentId,
  command,
}: {
  library: AssistantLibraryView;
  agentId: string;
  command(input: AssistantLibraryCommand): Promise<boolean>;
}) {
  const [editor, setEditor] = useState<Partial<AssistantSkill>>();
  const [runner, setRunner] = useState<AssistantSkill>();
  const [input, setInput] = useState('{}');
  const [error, setError] = useState('');
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h3>Executable skills</h3>
          <p>Reusable Bash routines. Each run asks you to review its code and app actions.</p>
        </div>
        <button
          disabled={!agentId}
          onClick={() =>
            setEditor({
              title: '',
              description: '',
              source:
                "# Read the permitted apps.\nsia_action computer_list '{}'\nprintf '%s\\n' \"$SIA_RESULT\" >&2\n",
            })
          }
        >
          New skill
        </button>
      </div>
      {(library.skills ?? [])
        .filter((entry) => entry.agentId === agentId)
        .map((entry) => (
          <article className={styles.card} key={entry.id}>
            <div>
              <strong>{entry.title}</strong>
              <p>{entry.description}</p>
            </div>
            <details>
              <summary>View Bash source</summary>
              <pre className={styles.source}>{entry.source}</pre>
            </details>
            <div className={styles.actions}>
              <button
                onClick={() => {
                  setRunner(entry);
                  setInput('{}');
                  setError('');
                }}
              >
                Run skill
              </button>
              <button onClick={() => setEditor(entry)}>Edit skill</button>
              <button onClick={() => void command({ operation: 'deleteSkill', id: entry.id })}>
                Delete skill
              </button>
            </div>
          </article>
        ))}
      {editor && (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            void command({
              operation: 'saveSkill',
              entry: {
                ...(editor.id ? { id: editor.id } : {}),
                agentId,
                title: editor.title ?? '',
                description: editor.description ?? '',
                source: editor.source ?? '',
              },
            }).then((ok) => {
              if (ok) setEditor(undefined);
            });
          }}
        >
          <label>
            Skill name
            <input
              required
              maxLength={100}
              value={editor.title ?? ''}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
            />
          </label>
          <label>
            When to use it
            <input
              required
              maxLength={500}
              value={editor.description ?? ''}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            />
          </label>
          <label>
            Bash source
            <textarea
              aria-label="Bash source"
              required
              maxLength={16000}
              value={editor.source ?? ''}
              onChange={(e) => setEditor({ ...editor, source: e.target.value })}
            />
          </label>
          <p>
            Use <code>sia_action TOOL JSON_ARGS</code> for app actions and inspect{' '}
            <code>SIA_RESULT</code>. Input JSON is in <code>SIA_INPUT</code>. Scripts run in an
            isolated scratch folder without direct access to your files, apps, or network. A
            refused or unverified action stops the run.
          </p>
          <div className={styles.actions}>
            <button type="submit">Save skill</button>
            <button type="button" onClick={() => setEditor(undefined)}>
              Cancel skill
            </button>
          </div>
        </form>
      )}
      {runner && (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const data: unknown = JSON.parse(input);
              if (
                !data ||
                Array.isArray(data) ||
                typeof data !== 'object' ||
                Object.keys(data).length > 12 ||
                Object.entries(data).some(
                  ([key, value]) =>
                    key.length > 100 || typeof value !== 'string' || value.length > 2000,
                )
              )
                throw new Error('Use a JSON object with up to 12 text inputs.');
              setError('');
              void command({
                operation: 'runSkill',
                id: runner.id,
                input: data as Record<string, string>,
              });
            } catch {
              setError(
                'Use a JSON object with up to 12 text inputs, for example {"topic":"Today"}.',
              );
            }
          }}
        >
          <h4>Run {runner.title}</h4>
          <label>
            Input JSON
            <textarea
              aria-label="Input JSON"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={26000}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit">Review run in a new conversation</button>
            <button type="button" onClick={() => setRunner(undefined)}>
              Cancel run
            </button>
          </div>
        </form>
      )}
    </>
  );
}
