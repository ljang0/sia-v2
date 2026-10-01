import * as Dialog from '@radix-ui/react-dialog';
import { FolderSimple, X } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  AgentDraft,
  AgentSummary,
  ProviderId,
  ProviderSetup,
  VoiceSettingsState,
} from '../types';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import styles from './AgentDialog.module.css';
import { modelChoices, firstReadyModel } from '../agentModels';
import { voiceOptionLabel } from '../voiceReadiness';
import { errorMessage } from '../plainErrors';

interface AgentDialogProps {
  open: boolean;
  agent?: AgentSummary | undefined;
  providers: ProviderSetup[];
  voice?: VoiceSettingsState | undefined;
  onOpenChange(open: boolean): void;
  onPickWorkspace(): Promise<string | undefined>;
  onOpenModelSettings?(): void;
  onSave(draft: AgentDraft): Promise<void>;
  onDelete?(): Promise<void>;
}

const emptyDraft: AgentDraft = {
  name: '',
  instructions: '',
  provider: 'meta',
  model: 'super_nova_ext',
  workspace: '',
};

export function AgentDialog({
  open,
  agent,
  providers,
  voice = { status: 'disconnected', voices: [] },
  onOpenChange,
  onPickWorkspace,
  onOpenModelSettings,
  onSave,
  onDelete,
}: AgentDialogProps) {
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const submission = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [modelChosen, setModelChosen] = useState(false);
  // A finished save closes without the exit animation: the view underneath is already
  // switching to the new conversation, and Radix keeps a closing dialog (and its overlay)
  // mounted until `animationend`, which never arrives while the window is not drawing.
  const [closeInstantly, setCloseInstantly] = useState(false);
  const formId = useId();
  const choices = useMemo(
    () =>
      modelChoices(
        providers,
        agent ? { provider: agent.provider, model: agent.model } : undefined,
      ),
    [agent, providers],
  );

  useEffect(() => {
    if (!open) return;
    submission.current = false;
    setSaving(false);
    setCloseInstantly(false);
    if (agent) {
      setDraft({
        name: agent.name,
        instructions: agent.instructions,
        provider: agent.provider,
        model: agent.model,
        workspace: agent.workspace,
        ...(agent.harnessPreference
          ? { harnessPreference: structuredClone(agent.harnessPreference) }
          : {}),
        hue: agent.hue,
        ...(agent.voiceId ? { voiceId: agent.voiceId } : {}),
      });
    } else {
      const first = firstReadyModel(providers);
      setDraft(
        first ? { ...emptyDraft, provider: first.provider, model: first.model } : emptyDraft,
      );
    }
    setError(undefined);
    setConfirmingDelete(false);
    setModelChosen(false);
  }, [agent, open]);

  useEffect(() => {
    if (!open || agent || modelChosen) return;
    const selected = choices.find(
      (choice) => choice.provider === draft.provider && choice.model === draft.model,
    );
    if (selected?.ready) return;
    const first = choices.find((choice) => choice.ready);
    if (first) {
      setDraft((current) => ({
        ...current,
        provider: first.provider,
        model: first.model,
      }));
    }
  }, [agent, choices, draft.model, draft.provider, modelChosen, open]);

  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submission.current) return;
    if (!draft.name.trim()) {
      setError('Give this agent a name.');
      return;
    }
    if (!draft.instructions.trim()) {
      setError('Add a short instruction for this agent.');
      return;
    }

    const selected = choices.find(
      (choice) => choice.provider === draft.provider && choice.model === draft.model,
    );
    if (!selected?.ready) {
      setError('Choose an available model before saving.');
      return;
    }

    submission.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const payload: AgentDraft = {
        ...draft,
        name: draft.name.trim(),
        instructions: draft.instructions.trim(),
        workspace: draft.workspace.trim(),
      };
      if (!agent) delete payload.hue;
      await onSave(payload);
      setCloseInstantly(true);
      onOpenChange(false);
    } catch (cause) {
      submission.current = false;
      setError(errorMessage(cause, 'The agent could not be saved.'));
      setSaving(false);
    }
  };

  const selectedChoice = choices.find(
    (choice) => choice.provider === draft.provider && choice.model === draft.model,
  );
  const readyChoices = choices.filter((choice) => choice.ready);
  const selectionValue = modelValue(draft.provider, draft.model);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={dialogs.dialogOverlay}
          {...(closeInstantly ? { 'data-instant-close': '' } : {})}
        />
        <Dialog.Content
          className={styles.dialogContent}
          {...(closeInstantly ? { 'data-instant-close': '' } : {})}
          aria-describedby={`${formId}-description`}
        >
          <div className={styles.dialogHeader}>
            <div>
              <Dialog.Title>{agent ? 'Edit agent' : 'New agent'}</Dialog.Title>
              <Dialog.Description id={`${formId}-description`}>
                Name it and describe the work. Sia handles the setup.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className={buttons.iconButton}
                aria-label="Close"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className={styles.agentForm} onSubmit={(event) => void submit(event)}>
            <label className={dialogs.field} htmlFor={`${formId}-name`}>
              <span>Name</span>
              <input
                id={`${formId}-name`}
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Example: Trip planner"
                autoFocus
                required
                aria-invalid={error === 'Give this agent a name.'}
              />
            </label>

            <div className={dialogs.field}>
              <label htmlFor={`${formId}-instructions`}>Instructions</label>
              <textarea
                id={`${formId}-instructions`}
                value={draft.instructions}
                onChange={(event) => update('instructions', event.target.value)}
                rows={3}
                placeholder="Example: Help me compare sources. Ask before changing files or sending anything."
                aria-required="true"
                aria-invalid={error === 'Add a short instruction for this agent.'}
              />
            </div>

            {readyChoices.length === 0 || !selectedChoice?.ready ? (
              <div className={styles.modelSetupNotice} role="status">
                <span>
                  {readyChoices.length === 0
                    ? 'No usable model is connected.'
                    : 'This agent’s model is unavailable. Choose another under Details.'}
                </span>
                {onOpenModelSettings ? (
                  <button
                    type="button"
                    className={buttons.textButton}
                    onClick={onOpenModelSettings}
                  >
                    Open model settings
                  </button>
                ) : null}
              </div>
            ) : null}

            <details className={styles.agentAdvanced}>
              <summary>
                <span>Details</span>
                <small>
                  {/* Engine and folder names are details for people who open this. */}
                  {draft.workspace ? workspaceName(draft.workspace) : 'Model and folder'}
                </small>
              </summary>
              <div className={styles.agentAdvancedBody}>
                <label className={dialogs.field} htmlFor={`${formId}-model`}>
                  <span>Model</span>
                  <select
                    id={`${formId}-model`}
                    value={selectionValue}
                    disabled={readyChoices.length === 0}
                    onChange={(event) => {
                      const choice = choices.find(
                        (candidate) =>
                          modelValue(candidate.provider, candidate.model) ===
                          event.target.value,
                      );
                      if (!choice) return;
                      setModelChosen(true);
                      setDraft((current) => ({
                        ...current,
                        provider: choice.provider,
                        model: choice.model,
                        harnessPreference: { mode: 'automatic' },
                      }));
                    }}
                  >
                    {choices.length === 0 ? (
                      <option value={selectionValue}>No model ready</option>
                    ) : null}
                    {choices.map((choice) => (
                      <option
                        key={modelValue(choice.provider, choice.model)}
                        value={modelValue(choice.provider, choice.model)}
                        disabled={!choice.ready}
                      >
                        {choice.label}
                        {choice.ready ? '' : ' — unavailable'}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={dialogs.field}>
                  <label htmlFor={`${formId}-workspace`}>Working folder</label>
                  <div className={styles.workspacePicker}>
                    <input
                      id={`${formId}-workspace`}
                      value={draft.workspace}
                      readOnly
                      placeholder={agent ? '' : 'Sia makes a private folder'}
                    />
                    <button
                      type="button"
                      className={buttons.secondaryButton}
                      onClick={async () => {
                        setError(undefined);
                        try {
                          const workspace = await onPickWorkspace();
                          if (workspace) update('workspace', workspace);
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : 'The workspace picker could not be opened.',
                          );
                        }
                      }}
                    >
                      <FolderSimple size={16} aria-hidden="true" />
                      Choose
                    </button>
                  </div>
                  <small>Agents can work only inside a folder you approve.</small>
                </div>

                {voice.status === 'connected' ? (
                  <label className={dialogs.field}>
                    <span>Voice</span>
                    <select
                      value={draft.voiceId ?? ''}
                      onChange={(event) => update('voiceId', event.target.value || undefined)}
                    >
                      <option value="">
                        Default{voice.selectedVoiceName ? ` (${voice.selectedVoiceName})` : ''}
                      </option>
                      {voice.voices.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {voiceOptionLabel(candidate)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </details>

            {confirmingDelete ? (
              <p className={styles.formError} role="alert">
                This permanently deletes {agent?.name} and all of its conversations, including
                archived ones and schedules. It does not delete files in its folder.
              </p>
            ) : null}
            {error ? <p className={styles.formError}>{error}</p> : null}

            <div className={dialogs.dialogActions}>
              {agent && onDelete ? (
                confirmingDelete ? (
                  <button
                    type="button"
                    className={buttons.dangerButton}
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setError(undefined);
                      try {
                        await onDelete();
                        onOpenChange(false);
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : 'The agent could not be deleted.',
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Delete agent and conversations
                  </button>
                ) : (
                  <button
                    type="button"
                    className={buttons.textButtonDanger}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete agent
                  </button>
                )
              ) : null}
              <span className={styles.dialogActionSpacer} />
              <Dialog.Close asChild>
                <button type="button" className={buttons.secondaryButton}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className={buttons.primaryButton}
                disabled={saving || !selectedChoice?.ready}
              >
                {saving ? 'Saving...' : agent ? 'Save changes' : 'Create agent'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function modelValue(provider: ProviderId, model: string): string {
  return `${provider}:${model}`;
}

function workspaceName(workspace: string): string {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace;
}
