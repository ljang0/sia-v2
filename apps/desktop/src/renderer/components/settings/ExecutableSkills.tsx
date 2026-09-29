import { useState } from 'react';
import { useConfirmDialog } from '../ConfirmDialog';
import { skillUnavailableReason } from '../../../shared/skill-execution';
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
  mode,
}: {
  library: AssistantLibraryView;
  agentId: string;
  command(input: AssistantLibraryCommand): Promise<boolean>;
  mode: 'native' | 'gateway';
}) {
  const [editor, setEditor] = useState<Partial<AssistantSkill>>();
  const [runner, setRunner] = useState<AssistantSkill>();
  const [input, setInput] = useState('{}');
  const [error, setError] = useState('');
  const [confirm, confirmDialog] = useConfirmDialog();
  return (
    <>
      {confirmDialog}
      <div className={styles.heading}>
        <div>
          <h3>Executable skills</h3>
          <p>
            {mode === 'native'
              ? 'Native Bash and AppleScript routines, discovered from your agent’s skill folder on every request. Runs follow your action approval setting.'
              : 'Reusable Bash routines. Each run asks you to review its code and app actions.'}
          </p>
        </div>
        <button
          disabled={!agentId}
          onClick={() =>
            setEditor({
              title: '',
              description: '',
              execution: mode,
              source:
                mode === 'native'
                  ? '#!/bin/bash\n# Add a reusable procedure; quote script arguments.\n'
                  : "# Read the permitted apps.\nsia_action computer_list '{}'\nprintf '%s\\n' \"$SIA_RESULT\" >&2\n",
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
              {entry.path && <small>{entry.path}</small>}
              {skillUnavailableReason(mode, entry.execution) && (
                <small>{skillUnavailableReason(mode, entry.execution)}</small>
              )}
            </div>
            <details>
              <summary>View Bash source</summary>
              <pre className={styles.source}>{entry.source}</pre>
            </details>
            <div className={styles.actions}>
              <button
                disabled={Boolean(skillUnavailableReason(mode, entry.execution))}
                onClick={() => {
                  setRunner(entry);
                  setInput('{}');
                  setError('');
                }}
              >
                Run skill
              </button>
              <button onClick={() => setEditor(entry)}>Edit skill</button>
              <button
                onClick={() =>
                  confirm({
                    title: 'Delete this skill?',
                    description: `“${entry.title}” will be removed. This can’t be undone.`,
                    confirmLabel: 'Delete',
                    onConfirm: () => command({ operation: 'deleteSkill', id: entry.id }),
                  })
                }
              >
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
                ...(editor.execution ? { execution: editor.execution } : {}),
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
          {editor.execution === 'native' ? (
            <p>
              Use ordinary Bash and AppleScript with quoted script arguments. Sia adds a skill
              metadata header and saves an executable file in your agent’s skill folder. Saving
              does not run it. Verify the requested result when you use it.
            </p>
          ) : (
            <p>
              Use <code>sia_action TOOL JSON_ARGS</code> for app actions and inspect{' '}
              <code>SIA_RESULT</code>. Input JSON is in <code>SIA_INPUT</code>. Scripts run in
              an isolated scratch folder without direct access to your files, apps, or network.
              A refused or unverified action stops the run.
            </p>
          )}
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
            <button type="submit">
              {runner.execution === 'native'
                ? 'Run in a new conversation'
                : 'Review run in a new conversation'}
            </button>
            <button type="button" onClick={() => setRunner(undefined)}>
              Cancel run
            </button>
          </div>
        </form>
      )}
    </>
  );
}
