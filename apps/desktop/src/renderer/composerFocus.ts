/** The composer's message field carries this attribute so focus can return to it. */
export const COMPOSER_INPUT_ATTRIBUTE = 'data-composer-input';
const COMPOSER_INPUT = `textarea[${COMPOSER_INPUT_ATTRIBUTE}]`;
const RETRY_MS = 50;

let cancelPending: (() => void) | undefined;

/**
 * Returns keyboard focus to the composer after an action removes the focused control
 * (Stop, Approve, a thread switch), like Codex and Claude do.
 *
 * The composer may be remounted or still disabled when the action settles, so this keeps
 * retrying for a short window. It never takes focus from something the person moved to
 * in the meantime: it only acts while focus is on the page body, on the control that
 * asked for it, or on a detached or disabled element.
 */
export function focusComposer(windowMs = 1500): void {
  if (typeof document === 'undefined') return;
  cancelPending?.();
  const origin = document.activeElement;
  const deadline = Date.now() + windowMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (cancelPending === stop) cancelPending = undefined;
  };
  const attempt = () => {
    if (stopped) return;
    // The page may have gone away (window closed, test environment torn down) between retries.
    if (typeof document === 'undefined') return stop();
    const composer = document.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT);
    const active = document.activeElement;
    if (active !== composer && !focusIsAdrift(active, origin)) return stop();
    if (composer && !composer.disabled && active !== composer) {
      composer.focus({ preventScroll: true });
    }
    if (Date.now() >= deadline) return stop();
    timer = setTimeout(attempt, RETRY_MS);
  };
  cancelPending = stop;
  attempt();
}

/** Stops a pending focusComposer retry, for when the app unmounts. */
export function cancelComposerFocus(): void {
  cancelPending?.();
}

/** True when focus is nowhere the person chose: the body, the requesting control, or a dead node. */
export function focusIsAdrift(active: Element | null, origin?: Element | null): boolean {
  if (!active || active === document.body || active === document.documentElement) return true;
  if (origin && active === origin) return true;
  if (!active.isConnected) return true;
  return (
    (active instanceof HTMLButtonElement || active instanceof HTMLTextAreaElement) &&
    active.disabled
  );
}
