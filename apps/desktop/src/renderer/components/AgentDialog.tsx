import * as Dialog from '@radix-ui/react-dialog';
import { ArrowClockwise, FolderSimple, WarningCircle, X } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import {
  providerReadinessMessage,
  providerSetupHref,
  providerSetupLabel,
  providerStatusLabel,
} from '../providerSetup';
import type {
  AgentDraft,
  AgentSummary,
  ProviderId,
  ProviderSetup,
  VoiceSettingsState,
} from '../types';
import styles from '../ui.module.css';
import { agentIdentity } from '../agentIdentity';

interface AgentDialogProps {
  open: boolean;
  agent?: AgentSummary | undefined;
  providers: ProviderSetup[];
  voice?: VoiceSettingsState | undefined;
  onOpenChange(open: boolean): void;
  onPickWorkspace(): Promise<string | undefined>;
  onProbeProvider?(provider: ProviderId): Promise<void>;
  onOpenCloudSettings?(): void;
  onSave(draft: AgentDraft): Promise<void>;
  onDelete?(): Promise<void>;
}

const HUES = [
  { slot: 0, name: 'Saffron' },
  { slot: 1, name: 'Coral' },
  { slot: 2, name: 'Sky' },
  { slot: 3, name: 'Mint' },
] as const;

const STARTER_PRESETS = [
  {
    name: 'Research partner',
    summary: 'Compare sources, expose uncertainty, and keep a decision trail.',
    instructions:
      'Help me investigate questions carefully. Compare primary sources, distinguish evidence from inference, surface uncertainty, and finish with the decisions or open questions that matter.',
  },
  {
    name: 'Release partner',
    summary: 'Track gates, test risky paths, and prepare a clear handoff.',
    instructions:
      'Help me prepare dependable releases. Keep source, tests, deployment state, artifacts, rollback, and human approvals distinct. Prioritize hard blockers and leave a concise evidence-backed handoff.',
  },
  {
    name: 'Workspace maintainer',
    summary: 'Understand the repository before making focused repairs.',
    instructions:
      'Maintain this workspace with small, reviewable changes. Read local conventions first, preserve unrelated work, test in proportion to risk, and explain any remaining operational tradeoffs.',
  },
  {
    name: 'Briefing partner',
    summary: 'Turn scattered updates into a short, useful briefing.',
    instructions:
      'Turn new information into concise briefings. Separate changes, decisions, risks, owners, and next actions. Keep source links and dates when they affect confidence or urgency.',
  },
] as const;

const emptyDraft: AgentDraft = {
  name: '',
  instructions: '',
  provider: 'codex',
  model: 'gpt-5.6-sol',
  workspace: '',
};

export function AgentDialog({
  open,
  agent,
  providers,
  voice = { status: 'disconnected', voices: [] },
  onOpenChange,
  onPickWorkspace,
  onProbeProvider,
  onOpenCloudSettings,
  onSave,
  onDelete,
}: AgentDialogProps) {
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formId = useId();

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setDraft({
        name: agent.name,
        instructions: agent.instructions,
        provider: agent.provider,
        model: agent.model,
        workspace: agent.workspace,
        hue: agent.hue,
        ...(agent.voiceId ? { voiceId: agent.voiceId } : {}),
      });
    } else {
      const provider =
        providers.find((candidate) => candidate.status === 'ready') ??
        providers.find((candidate) => candidate.status !== 'disabled');
      setDraft(
        provider ? { ...emptyDraft, provider: provider.id, model: provider.model } : emptyDraft,
      );
    }
    setError(undefined);
    setChecking(false);
    setConfirmingDelete(false);
  }, [agent, open]);

  // Until the person picks a color, the swatch follows the name — a new agent arrives with a hue.
  const effectiveHue = draft.hue ?? agentIdentity(draft.name.trim());

  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const provider = providers.find((candidate) => candidate.id === draft.provider);
    if (!provider || provider.status !== 'ready') {
      setError(
        provider
          ? providerReadinessMessage(provider)
          : 'Choose an available provider before saving.',
      );
      return;
    }
    if (!draft.name.trim()) {
      setError('Give this agent a name.');
      return;
    }
    if (!draft.workspace.trim()) {
      setError('Choose a workspace before saving.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        instructions: draft.instructions.trim(),
        hue: draft.hue ?? agentIdentity(draft.name.trim()),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The agent could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = providers.find((provider) => provider.id === draft.provider);
  const providerReady = selectedProvider?.status === 'ready';
  const setupHref = selectedProvider ? providerSetupHref(selectedProvider) : undefined;

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
                These defaults are copied into each new thread and stay pinned there.
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
            {!agent ? (
              <fieldset className={styles.starterPresets}>
                <legend>Start with a role</legend>
                <div>
                  {STARTER_PRESETS.map((preset) => {
                    const selected =
                      draft.name === preset.name && draft.instructions === preset.instructions;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            name: preset.name,
                            instructions: preset.instructions,
                          }))
                        }
                      >
                        <strong>{preset.name}</strong>
                        <span>{preset.summary}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <label className={styles.field}>
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Research partner"
                autoFocus
                aria-invalid={Boolean(error && !draft.name.trim())}
              />
            </label>

            <label className={styles.field}>
              <span>Instructions</span>
              <textarea
                value={draft.instructions}
                onChange={(event) => update('instructions', event.target.value)}
                rows={5}
                placeholder="Describe how this agent should work and what it should protect."
              />
              <small>Keep this durable. Put one-time task details in the thread.</small>
            </label>

            <div className={styles.formColumns}>
              <label className={styles.field}>
                <span>Provider</span>
                <select
                  value={draft.provider}
                  onChange={(event) => {
                    const provider = event.target.value as ProviderId;
                    const setup = providers.find((item) => item.id === provider);
                    update('provider', provider);
                    if (setup) update('model', setup.model || defaultModel(provider));
                  }}
                >
                  {providers.map((provider) => (
                    <option
                      key={provider.id}
                      value={provider.id}
                      disabled={provider.status === 'disabled'}
                    >
                      {provider.name}
                      {provider.status === 'ready'
                        ? ''
                        : ` (${providerStatusLabel(provider).toLowerCase()})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Model</span>
                <input value={draft.model} readOnly aria-readonly="true" />
                <small>Pinned by this alpha&apos;s verified provider configuration.</small>
              </label>
            </div>

            <div className={styles.field}>
              <span id={`${formId}-hue`}>Color</span>
              <div
                className={styles.hueSwatches}
                role="radiogroup"
                aria-labelledby={`${formId}-hue`}
              >
                {HUES.map((hue) => (
                  <button
                    key={hue.slot}
                    type="button"
                    role="radio"
                    aria-checked={effectiveHue === hue.slot}
                    aria-label={hue.name}
                    title={hue.name}
                    className={styles.hueSwatch}
                    data-identity={hue.slot}
                    onClick={() => update('hue', hue.slot)}
                  />
                ))}
              </div>
              <small>Tints this agent&apos;s room, avatar, and approvals.</small>
            </div>

            {voice.status === 'connected' ? (
              <label className={styles.field}>
                <span>Voice</span>
                <select
                  aria-label="Voice"
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
                <small>Used only when you choose Read aloud.</small>
              </label>
            ) : null}

            {selectedProvider && !providerReady ? (
              <div className={styles.providerSetupNotice} role="status">
                <WarningCircle size={17} aria-hidden="true" />
                <div>
                  <strong>{providerStatusLabel(selectedProvider)}</strong>
                  <p>{providerReadinessMessage(selectedProvider)}</p>
                  <div className={styles.providerSetupActions}>
                    {selectedProvider.id === 'meta' &&
                    selectedProvider.status === 'needs-login' &&
                    onOpenCloudSettings ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={onOpenCloudSettings}
                      >
                        {providerSetupLabel(selectedProvider)}
                      </button>
                    ) : setupHref ? (
                      <a
                        className={`${styles.secondaryButton} ${styles.externalSetupLink}`}
                        href={setupHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {providerSetupLabel(selectedProvider)}
                      </a>
                    ) : null}
                    {selectedProvider.status !== 'disabled' && onProbeProvider ? (
                      <button
                        type="button"
                        className={styles.textButton}
                        disabled={checking}
                        onClick={async () => {
                          setChecking(true);
                          setError(undefined);
                          try {
                            await onProbeProvider(selectedProvider.id);
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'The provider could not be checked.',
                            );
                          } finally {
                            setChecking(false);
                          }
                        }}
                      >
                        <ArrowClockwise size={14} aria-hidden="true" />
                        {checking ? 'Checking...' : 'Recheck'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor={`${formId}-workspace`}>Workspace</label>
              <div className={styles.workspacePicker}>
                <input
                  id={`${formId}-workspace`}
                  value={draft.workspace}
                  readOnly
                  placeholder="Choose a folder"
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
            </div>

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
                disabled={saving || !providerReady}
              >
                {saving
                  ? 'Saving...'
                  : !providerReady
                    ? 'Set up provider first'
                    : agent
                      ? 'Save changes'
                      : 'Create agent'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function defaultModel(provider: ProviderId) {
  return {
    codex: 'gpt-5.6-sol',
    meta: 'super_nova_ext',
    grok: 'grok-code-fast',
    gemini: 'gemini-2.5-pro',
    claude: 'claude-sonnet-4-5',
  }[provider];
}
