import { WarningCircle } from '@phosphor-icons/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from '../ui.module.css';

interface BoundaryState {
  failed: boolean;
}

/**
 * Last line of defence for the whole window: a rendering bug shows a plain message and a
 * Reload button instead of an empty window. Saved conversations live in the main process,
 * so reloading loses nothing.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode; onReload?: (() => void) | undefined },
  BoundaryState
> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Sia could not show this window', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.fatalState} role="alert" data-testid="app-error-boundary">
        <WarningCircle size={26} aria-hidden="true" />
        <h1>Something went wrong</h1>
        <p>Sia hit a problem showing this window. Your conversations are saved.</p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => (this.props.onReload ?? (() => window.location.reload()))()}
        >
          Reload
        </button>
      </div>
    );
  }
}

/**
 * Contains a rendering failure to one conversation row, so one malformed message cannot
 * take the rest of the conversation with it. A changed row gets a fresh attempt.
 */
export class RowErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown },
  BoundaryState & { resetKey?: unknown }
> {
  override state: BoundaryState & { resetKey?: unknown } = {
    failed: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: unknown },
    state: BoundaryState & { resetKey?: unknown },
  ): Partial<BoundaryState & { resetKey?: unknown }> | null {
    return props.resetKey !== state.resetKey
      ? { failed: false, resetKey: props.resetKey }
      : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Sia could not show a conversation row', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.notice} role="status" data-testid="row-error-boundary">
        <WarningCircle size={17} aria-hidden="true" />
        <div>
          <strong>This message couldn’t be shown</strong>
          <p>The rest of the conversation is unaffected.</p>
        </div>
      </div>
    );
  }
}
