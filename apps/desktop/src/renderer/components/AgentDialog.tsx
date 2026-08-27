import * as Dialog from '@radix-ui/react-dialog';
import { FolderSimple, X } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import type {
  AgentDraft,
  AgentSummary,
  ProviderId,
  ProviderSetup,
  VoiceSettingsState,
} from '../types';
import styles from '../ui.module.css';

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

interface ModelChoice {
  provider: ProviderId;
  model: string;
  label: string;
  ready: boolean;
}

const RELEASE_PROVIDER_ORDER: ProviderId[] = ['meta', 'codex'];

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [modelChosen, setModelChosen] = useState(false);
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
    if (!draft.name.trim()) {
      setError('Give this agent a name.');
      return;
    }

    const selected = choices.find(
      (choice) => choice.provider === draft.provider && choice.model === draft.model,
    );
    if (!selected?.ready) {
      setError('Choose an available model before saving.');
      return;
    }

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
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The agent could not be saved.');
    } finally {
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
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content
          className={styles.dialogContent}
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
                className={styles.iconButton}
                aria-label="Close"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className={styles.agentForm} onSubmit={(event) => void submit(event)}>
            <label className={styles.field} htmlFor={`${formId}-name`}>
              <span>Name</span>
              <input
                id={`${formId}-name`}
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Research partner"
                autoFocus
                required
                aria-invalid={error === 'Give this agent a name.'}
              />
            </label>

            <div className={styles.field}>
              <label htmlFor={`${formId}-instructions`}>Instructions</label>
              <textarea
                id={`${formId}-instructions`}
                value={draft.instructions}
                onChange={(event) => update('instructions', event.target.value)}
                rows={3}
                placeholder="What should this agent do, prioritize, and protect?"
              />
            </div>

            {readyChoices.length === 0 || !selectedChoice?.ready ? (
              <div className={styles.modelSetupNotice} role="status">
                <span>No usable model is connected.</span>
                {onOpenModelSettings ? (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={onOpenModelSettings}
                  >
                    Open AI settings
                  </button>
                ) : null}
              </div>
            ) : null}

            <details className={styles.agentAdvanced}>
              <summary>
                <span>Details</span>
                <small>
                  {draft.workspace
                    ? workspaceName(draft.workspace)
                    : (selectedChoice?.label ?? 'Automatic model and folder')}
                </small>
              </summary>
              <div className={styles.agentAdvancedBody}>
                <label className={styles.field} htmlFor={`${formId}-model`}>
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

                <div className={styles.field}>
                  <label htmlFor={`${formId}-workspace`}>Working folder</label>
                  <div className={styles.workspacePicker}>
                    <input
                      id={`${formId}-workspace`}
                      value={draft.workspace}
                      readOnly
                      placeholder="Choose when you create"
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
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
                  <label className={styles.field}>
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
                          {candidate.name}
                          {candidate.category ? ` · ${candidate.category}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </details>

            {error ? <p className={styles.formError}>{error}</p> : null}

            <div className={styles.dialogActions}>
              {agent && onDelete ? (
                confirmingDelete ? (
                  <button
                    type="button"
                    className={styles.dangerButton}
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
                    Delete agent and threads
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.textButtonDanger}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete agent
                  </button>
                )
              ) : null}
              <span className={styles.dialogActionSpacer} />
              <Dialog.Close asChild>
                <button type="button" className={styles.secondaryButton}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className={styles.primaryButton}
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

function firstReadyModel(providers: ProviderSetup[]): ModelChoice | undefined {
  return modelChoices(providers).find((choice) => choice.ready);
}

function modelChoices(
  providers: ProviderSetup[],
  current?: { provider: ProviderId; model: string },
): ModelChoice[] {
  const choices = RELEASE_PROVIDER_ORDER.flatMap((providerId) => {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) return [];
    const models = provider.models?.length
      ? provider.models.map((model) => ({ id: model.id, label: model.label }))
      : [{ id: provider.model, label: friendlyModelName(provider.id, provider.model) }];
    return models.map((model) => ({
      provider: provider.id,
      model: model.id,
      label:
        provider.id === 'meta'
          ? `${model.label} · Included`
          : provider.id === 'codex'
            ? `${model.label} · Codex plan`
            : `${model.label} — ${provider.name}`,
      ready: provider.status === 'ready',
    }));
  });

  if (
    current &&
    !choices.some(
      (choice) => choice.provider === current.provider && choice.model === current.model,
    )
  ) {
    const provider = providers.find((candidate) => candidate.id === current.provider);
    choices.push({
      provider: current.provider,
      model: current.model,
      label: `${friendlyModelName(current.provider, current.model)} — ${provider?.name ?? 'Current plan'}`,
      ready: provider?.status === 'ready',
    });
  }

  return choices;
}

function friendlyModelName(provider: ProviderId, model: string): string {
  if (provider === 'meta') return 'Included model';
  if (model === 'gpt-5.6-sol') return 'GPT-5.6 Sol';
  if (model === 'sonnet') return 'Sonnet';
  return model
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function modelValue(provider: ProviderId, model: string): string {
  return `${provider}:${model}`;
}

function workspaceName(workspace: string): string {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace;
}
