import { WarningCircle } from '@phosphor-icons/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import buttons from '../styles/buttons.module.css';
import primitives from '../styles/primitives.module.css';
import styles from './ErrorBoundary.module.css';
import { FeedbackDialog } from './FeedbackDialog';

interface BoundaryState {
  failed: boolean;
}

interface AppBoundaryState extends BoundaryState {
  details?: string | undefined;
  copied?: boolean | undefined;
  feedbackOpen?: boolean | undefined;
}

interface AppBoundaryProps {
  children: ReactNode;
  onReload?: (() => void) | undefined;
  /** Opens the same feedback draft as Help → Send feedback. */
  onSendFeedback?:
    ((message: string, includeDiagnostics: boolean) => Promise<void>) | undefined;
}

/**
 * Last line of defence for the whole window: a rendering bug shows a plain message and a
 * Reload button instead of an empty window. Saved conversations live in the main process,
 * so reloading loses nothing.
 */
export class AppErrorBoundary extends Component<AppBoundaryProps, AppBoundaryState> {
  override state: AppBoundaryState = { failed: false };

  static getDerivedStateFromError(): Partial<AppBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console -- render crashes are reported to the developer console.
    console.error('Sia could not show this window', error, info.componentStack);
    this.setState({ details: errorDetails(error, info.componentStack) });
  }

  #copy = async () => {
    try {
      await navigator.clipboard.writeText(this.state.details ?? 'No details were recorded.');
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  override render() {
    if (!this.state.failed) return this.props.children;
    const { onSendFeedback } = this.props;
    return (
      <div className={styles.fatalState} role="alert" data-testid="app-error-boundary">
        <span className={styles.fatalIcon} aria-hidden="true">
          <WarningCircle size={24} weight="duotone" />
        </span>
        <h1>Something went wrong</h1>
        <p>
          Sia hit a snag showing this window. Your conversations are safe, and reloading usually
          fixes it.
        </p>
        <div className={styles.fatalActions}>
          <button
            type="button"
            className={`${buttons.primaryButton} ${styles.fatalAction}`}
            onClick={() => (this.props.onReload ?? (() => window.location.reload()))()}
          >
            Reload
          </button>
          <button
            type="button"
            className={buttons.secondaryButton}
            onClick={() => void this.#copy()}
          >
            {this.state.copied ? 'Details copied' : 'Copy details'}
          </button>
          {onSendFeedback ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              onClick={() => this.setState({ feedbackOpen: true })}
            >
              Send feedback
            </button>
          ) : null}
        </div>
        {onSendFeedback ? (
          <FeedbackDialog
            open={Boolean(this.state.feedbackOpen)}
            initialMessage={`Sia showed “Something went wrong” while I was:\n\n\nDetails:\n${firstLine(this.state.details)}`}
            onOpenChange={(open) => this.setState({ feedbackOpen: open })}
            onSubmit={onSendFeedback}
          />
        ) : null}
      </div>
    );
  }
}

/** What a person can paste into a report: the error and where it happened, nothing else. */
function errorDetails(error: unknown, componentStack: string | null | undefined): string {
  const summary =
    error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`;
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  return [
    summary,
    `Page: ${typeof location === 'undefined' ? 'unknown' : location.hash || '/'}`,
    stack && `Stack:\n${stack}`,
    componentStack && `Components:${componentStack}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function firstLine(details: string | undefined): string {
  return details?.split('\n', 1)[0] ?? 'No details were recorded.';
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
    // eslint-disable-next-line no-console -- render crashes are reported to the developer console.
    console.error('Sia could not show a conversation row', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={primitives.notice} role="status" data-testid="row-error-boundary">
        <WarningCircle size={17} aria-hidden="true" />
        <div>
          <strong>This message couldn’t be shown</strong>
          <p>The rest of the conversation is unaffected.</p>
        </div>
      </div>
    );
  }
}
