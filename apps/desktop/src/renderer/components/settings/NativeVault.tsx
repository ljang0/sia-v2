import { useState } from 'react';
import { useConfirmDialog } from '../ConfirmDialog';
import type {
  AssistantLibraryCommand,
  AssistantLibraryView,
} from '../../../shared/assistant-library';
import styles from './AssistantSettings.module.css';

export function NativeVault({
  library,
  agentId,
  command,
}: {
  library: AssistantLibraryView;
  agentId: string;
  command(input: AssistantLibraryCommand): Promise<boolean>;
}) {
  const notes = library.vaults?.find((vault) => vault.agentId === agentId)?.notes ?? [];
  const [editing, setEditing] = useState<{ name: string; text: string; revision: string }>();
  const [confirm, confirmDialog] = useConfirmDialog();
  return (
    <details>
      <summary>Native memory vault ({notes.length} files)</summary>
      {confirmDialog}
      <p className={styles.note}>
        Linked notes, lessons and skills used directly by your Mac agent. These are local files
        in the agent’s workspace. Saved preferences below remain encrypted in Sia and are copied
        into preferences.md for the agent.
      </p>
      <button
        type="button"
        onClick={() => setEditing({ name: 'new-note.md', text: '', revision: '' })}
      >
        Add vault note
      </button>
      {notes.map((note) => (
        <article className={styles.card} key={note.name}>
          <strong>{note.name}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
            {note.text}
          </pre>
          {!note.readOnly && (
            <div className={styles.actions}>
              <button type="button" onClick={() => setEditing(note)}>
                Edit {note.name}
              </button>
              {!['MOC.md', 'lessons.md', 'journal.md', 'failures.log'].includes(note.name) && (
                <button
                  type="button"
                  onClick={() =>
                    confirm({
                      title: 'Delete this note?',
                      description: `Sia will forget “${note.name}”. This can’t be undone.`,
                      confirmLabel: 'Delete',
                      onConfirm: () =>
                        command({
                          operation: 'deleteVaultNote',
                          agentId,
                          name: note.name,
                          revision: note.revision,
                        }),
                    })
                  }
                >
                  Delete {note.name}
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command({ operation: 'saveVaultNote', agentId, ...editing }).then((saved) => {
              if (saved) setEditing(undefined);
            });
          }}
        >
          <label>
            File name
            <input
              value={editing.name}
              disabled={!!editing.revision}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            />
          </label>
          <label>
            Note contents
            <textarea
              rows={12}
              value={editing.text}
              onChange={(event) => setEditing({ ...editing, text: event.target.value })}
            />
          </label>
          <div className={styles.actions}>
            <button type="submit">Save note</button>
            <button type="button" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </details>
  );
}
