import {
  Check,
  CircleNotch,
  EnvelopeSimple,
  FileText,
  FolderSimple,
  PlugsConnected,
  Presentation,
  Table,
} from '@phosphor-icons/react';
import type { AppConnection } from '../../types';
import styles from '../../ui.module.css';

const icons = {
  gmail: EnvelopeSimple,
  drive: FolderSimple,
  docs: FileText,
  sheets: Table,
  slides: Presentation,
  slack: PlugsConnected,
};

export function ConnectionAppChooser({
  apps,
  selected,
  busy,
  disabled,
  onChange,
  onConnect,
}: {
  apps: readonly AppConnection[];
  selected: ReadonlySet<AppConnection['id']>;
  busy: boolean;
  disabled: boolean;
  onChange(next: Set<AppConnection['id']>): void;
  onConnect(): void;
}) {
  const selectable = apps.filter(({ status }) => status !== 'connected');
  const pendingCount = selectable.filter(({ id }) => selected.has(id)).length;
  const allSelected = selectable.length > 0 && pendingCount === selectable.length;

  const toggleAll = () => {
    const next = new Set(selected);
    for (const app of selectable) {
      if (allSelected) next.delete(app.id);
      else next.add(app.id);
    }
    onChange(next);
  };

  return (
    <fieldset className={styles.connectionChoicePanel}>
      <legend className={styles.visuallyHidden}>Choose apps to connect</legend>
      <div className={styles.connectionChoiceHeader}>
        <div>
          <strong>Select apps</strong>
          <p>Connected services stay checked. You can change this later in Connections.</p>
        </div>
        {selectable.length > 0 ? (
          <button
            type="button"
            className={styles.textButton}
            disabled={busy || disabled}
            onClick={toggleAll}
          >
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
      </div>

      <div className={styles.connectionChoiceGrid}>
        {apps.map((app) => {
          const Icon = icons[app.id];
          const connected = app.status === 'connected';
          const checked = connected || selected.has(app.id);
          return (
            <label
              key={app.id}
              className={styles.connectionChoiceOption}
              data-checked={checked}
              data-status={app.status}
            >
              <input
                type="checkbox"
                aria-label={`Select ${app.name}`}
                checked={checked}
                disabled={connected || busy || disabled}
                onChange={() => {
                  const next = new Set(selected);
                  if (checked) next.delete(app.id);
                  else next.add(app.id);
                  onChange(next);
                }}
              />
              <span className={styles.connectionChoiceGlyph} aria-hidden="true">
                {connected ? <Check size={15} weight="bold" /> : <Icon size={18} />}
              </span>
              <span className={styles.connectionChoiceCopy}>
                <strong>{app.name}</strong>
                <small>
                  {connected
                    ? 'Connected'
                    : app.status === 'connecting'
                      ? 'Waiting for approval'
                      : app.status === 'error'
                        ? 'Needs attention'
                        : 'Not connected'}
                </small>
              </span>
              <span className={styles.connectionChoiceCheck} aria-hidden="true">
                {checked ? <Check size={12} weight="bold" /> : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className={styles.connectionChoiceFooter}>
        <span aria-live="polite">
          {pendingCount === 0
            ? 'No new apps selected'
            : `${pendingCount} ${pendingCount === 1 ? 'app' : 'apps'} selected`}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || disabled || pendingCount === 0}
          onClick={onConnect}
        >
          {busy ? (
            <CircleNotch className={styles.spin} size={16} aria-hidden="true" />
          ) : (
            <PlugsConnected size={16} aria-hidden="true" />
          )}
          {busy ? 'Opening browser...' : 'Connect selected'}
        </button>
      </div>
    </fieldset>
  );
}
