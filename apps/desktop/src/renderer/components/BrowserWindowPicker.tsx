import { ArrowRight, Browser } from '@phosphor-icons/react';
import type { BrowserWindowChoice } from '../types';
import styles from '../ui.module.css';

export function BrowserWindowPicker({
  windows,
  pending,
  onSelect,
}: {
  windows: readonly BrowserWindowChoice[];
  pending: boolean;
  onSelect(windowId: number): void;
}) {
  return (
    <div className={styles.browserWindowPicker} aria-label="Available Chrome windows">
      {windows.map((window) => (
        <button
          type="button"
          className={styles.browserWindowOption}
          key={window.id}
          disabled={pending}
          onClick={() => onSelect(window.id)}
          aria-label={`Use ${window.label}${window.detail ? `: ${window.detail}` : ''}`}
        >
          <span className={styles.browserWindowIcon}>
            <Browser size={17} aria-hidden="true" />
          </span>
          <span className={styles.browserWindowText}>
            <strong>{window.label}</strong>
            <span title={window.detail}>{window.detail ?? 'Open Chrome window'}</span>
          </span>
          <span className={styles.browserWindowAction}>
            {pending ? 'Connecting…' : 'Use window'}
            {!pending ? <ArrowRight size={14} aria-hidden="true" /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
