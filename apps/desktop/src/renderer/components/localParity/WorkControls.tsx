import { CaretDown, CheckCircle, Flag, Pause, Play } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ThreadGoal } from '../../types';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import surface from './localParity.module.css';
import ui from '../../ui.module.css';
import styles from './WorkControls.module.css';

interface SelectOption {
  id: string;
  label: string;
  detail?: string | undefined;
}

interface ThreadModelControlsProps {
  workspace?: string | undefined;
  modelId: string;
  reasoningId: string;
  models: readonly SelectOption[];
  reasoningOptions: readonly SelectOption[];
  disabled?: boolean | undefined;
  onChangeModel(modelId: string): Promise<void> | void;
  onChangeReasoning(reasoningId: string, modelId: string): Promise<void> | void;
}

export function ThreadModelControls({
  workspace,
  modelId,
  reasoningId,
  models,
  reasoningOptions,
  disabled,
  onChangeModel,
  onChangeReasoning,
}: ThreadModelControlsProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  // The snapshot carrying a new model can arrive after the next reasoning change, so reasoning
  // changes send the model the person last picked rather than the one from the last render.
  const pickedModel = useRef(modelId);
  useEffect(() => {
    pickedModel.current = modelId;
  }, [modelId]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details ref={menu} className={styles.agentSettingsMenu}>
      <summary>
        Model for this conversation <CaretDown size={13} aria-hidden="true" />
      </summary>
      <section className={styles.threadControls} aria-label="Model for this conversation">
        <label>
          <span>Model</span>
          <select
            aria-label="Model"
            data-testid="thread-model-select"
            value={modelId}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              pickedModel.current = next;
              void Promise.resolve(onChangeModel(next)).catch(() => {
                pickedModel.current = modelId;
              });
            }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} title={model.detail}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.threadControlDivider} aria-hidden="true">
          ·
        </span>
        <label>
          <span>Reasoning</span>
          <select
            aria-label="Reasoning"
            data-testid="thread-reasoning-select"
            value={reasoningId}
            disabled={disabled}
            onChange={(event) =>
              void onChangeReasoning(event.target.value, pickedModel.current)
            }
          >
            {reasoningOptions.map((option) => (
              <option key={option.id} value={option.id} title={option.detail}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {workspace && (
          <details className={styles.workspaceDetails}>
            <summary>Workspace</summary>
            <p>{workspace}</p>
          </details>
        )}
      </section>
    </details>
  );
}

interface GoalControlsProps {
  goal?: ThreadGoal | undefined;
  busy?: boolean | undefined;
  onSetGoal(text: string): Promise<void> | void;
  onPauseGoal(): Promise<void> | void;
  onResumeGoal(): Promise<void> | void;
  onClearGoal(): Promise<void> | void;
}

export function GoalControls({
  goal,
  busy,
  onSetGoal,
  onPauseGoal,
  onResumeGoal,
  onClearGoal,
}: GoalControlsProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  if (goal) {
    return (
      <section className={surface.goalControl} aria-labelledby={`${inputId}-title`}>
        <div className={surface.localSurfaceHeader}>
          <div>
            <span className={ui.sectionLabel}>Goal for this conversation</span>
            <h2 id={`${inputId}-title`}>{goal.text}</h2>
          </div>
          <span className={styles.goalStatus} data-status={goal.status}>
            {goal.status === 'running' ? (
              <CheckCircle size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
            {goal.status === 'running' ? 'Active' : 'Paused'}
          </span>
        </div>
        <div className={styles.localActionRow}>
          {goal.status === 'running' ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              disabled={busy}
              onClick={() => void onPauseGoal()}
            >
              <Pause size={14} aria-hidden="true" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              className={buttons.secondaryButton}
              disabled={busy}
              onClick={() => void onResumeGoal()}
            >
              <Play size={14} aria-hidden="true" />
              Resume
            </button>
          )}
          <button
            type="button"
            className={buttons.textButtonDanger}
            disabled={busy}
            onClick={() => void onClearGoal()}
          >
            Clear goal
          </button>
        </div>
      </section>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    void Promise.resolve(onSetGoal(value)).then(() => setDraft(''));
  };

  return (
    <form
      className={surface.goalControl}
      onSubmit={submit}
      aria-labelledby={`${inputId}-title`}
    >
      <div className={surface.localSurfaceHeader}>
        <div>
          <span className={ui.sectionLabel}>Goal for this conversation</span>
          <h2 id={`${inputId}-title`}>Keep a long task on course</h2>
          <p className={styles.goalIntro}>
            Name the finish line and Sia keeps it in view while it works.
          </p>
        </div>
        <Flag size={18} aria-hidden="true" />
      </div>
      <label className={dialogs.localField} htmlFor={inputId}>
        <span>Goal</span>
        <input
          data-testid="goal-title-input"
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Plan a 3-day trip to Lisbon with a daily itinerary"
          disabled={busy}
        />
      </label>
      <button
        className={`${buttons.primaryButton} ${surface.goalSubmit}`}
        type="submit"
        disabled={busy || !draft.trim()}
        data-testid="goal-save"
      >
        Set goal
      </button>
    </form>
  );
}
