import * as Dialog from '@radix-ui/react-dialog';
import { CaretRight, Command, Play, SpinnerGap, Stop, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import styles from '../../ui.module.css';
import type { BackgroundTerminal } from '../../types';

interface TerminalRunRequest {
  command: string;
  workspace: string;
}

export interface TerminalRunState {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  command?: string | undefined;
  output?: string | undefined;
  exitCode?: number | undefined;
}

interface TerminalDrawerProps {
  open: boolean;
  workspace: string;
  run: TerminalRunState;
  background?: readonly BackgroundTerminal[] | undefined;
  backgroundStarting?: boolean | undefined;
  returnFocusRef?: RefObject<HTMLElement | null> | undefined;
  onOpenChange(open: boolean): void;
  onRun(request: TerminalRunRequest): Promise<void> | void;
  onStartBackground?: ((request: TerminalRunRequest) => Promise<void> | void) | undefined;
  onStopBackground?: ((id: string) => Promise<void> | void) | undefined;
  onWriteBackground?: ((id: string, input: string) => Promise<void> | void) | undefined;
}

export function TerminalDrawer({
  open,
  workspace,
  run,
  background = [],
  backgroundStarting,
  returnFocusRef,
  onOpenChange,
  onRun,
  onStartBackground,
  onStopBackground,
  onWriteBackground,
}: TerminalDrawerProps) {
  const [command, setCommand] = useState('');
  const [processInput, setProcessInput] = useState('');
  const descriptionId = useId();
  const commandInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setCommand('');
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value || run.status === 'running') return;
    void onRun({ command: value, workspace });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.terminalOverlay} />
        <Dialog.Content
          className={styles.terminalDrawer}
          aria-describedby={descriptionId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            commandInput.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef?.current;
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <header>
            <div>
              <Dialog.Title>Terminal</Dialog.Title>
              <Dialog.Description id={descriptionId}>
                Scoped to <strong>{workspace}</strong>. Start a bounded command or keep a
                process running in the background.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.iconButton} aria-label="Close terminal">
                <X size={17} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <form className={styles.terminalForm} onSubmit={submit}>
            <label>
              <Command size={16} aria-hidden="true" />
              <span className={styles.visuallyHidden}>Command</span>
              <input
                ref={commandInput}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="pnpm test"
                autoComplete="off"
                spellCheck={false}
                disabled={run.status === 'running'}
                data-testid="terminal-command-input"
              />
            </label>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={run.status === 'running' || !command.trim()}
              data-testid="terminal-run"
            >
              {run.status === 'running' ? (
                <SpinnerGap className={styles.spin} size={14} aria-hidden="true" />
              ) : (
                <Play size={14} aria-hidden="true" />
              )}
              Run once
            </button>
            {onStartBackground ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={run.status === 'running' || backgroundStarting || !command.trim()}
                onClick={() => {
                  const value = command.trim();
                  if (value) void onStartBackground({ command: value, workspace });
                }}
                data-testid="terminal-start-background"
              >
                {backgroundStarting ? (
                  <SpinnerGap className={styles.spin} size={14} aria-hidden="true" />
                ) : (
                  <Play size={14} aria-hidden="true" />
                )}
                Background
              </button>
            ) : null}
          </form>

          {run.status !== 'idle' ? (
            <section className={styles.terminalOutput} aria-live="polite">
              <header>
                <span>
                  <CaretRight size={13} aria-hidden="true" />
                  {run.command}
                </span>
                {run.exitCode !== undefined ? (
                  <span data-testid="terminal-status">exit {run.exitCode}</span>
                ) : null}
              </header>
              <pre data-testid="terminal-output">
                {run.output || (run.status === 'running' ? 'Running…' : 'No output')}
              </pre>
            </section>
          ) : background.length === 0 ? (
            <p className={styles.terminalNote}>
              Commands inherit only the approved workspace context.
            </p>
          ) : null}

          {background.length ? (
            <section className={styles.backgroundTerminals} aria-label="Background processes">
              {background.map((session) => (
                <article
                  key={session.id}
                  data-status={session.status}
                  data-testid="background-terminal-row"
                >
                  <header>
                    <span>
                      <CaretRight size={13} aria-hidden="true" />
                      {session.command}
                    </span>
                    <span data-testid="background-terminal-status">{session.status}</span>
                    {session.status === 'running' && onStopBackground ? (
                      <button
                        type="button"
                        className={styles.iconButtonSmall}
                        onClick={() => void onStopBackground(session.id)}
                        aria-label={`Stop ${session.command}`}
                        data-testid="background-terminal-stop"
                      >
                        <Stop size={12} weight="fill" aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>
                  <pre data-testid="background-terminal-output">
                    {session.output || 'Waiting for output…'}
                  </pre>
                  {session.truncated ? <small>Showing the newest output.</small> : null}
                  {session.status === 'running' && onWriteBackground ? (
                    <form
                      className={styles.backgroundTerminalInput}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!processInput) return;
                        void onWriteBackground(session.id, `${processInput}\n`);
                        setProcessInput('');
                      }}
                    >
                      <input
                        value={processInput}
                        onChange={(event) => setProcessInput(event.target.value)}
                        placeholder="Send input"
                        aria-label={`Input for ${session.command}`}
                        data-testid="background-terminal-input"
                      />
                      <button type="submit" className={styles.secondaryButton}>
                        Send
                      </button>
                    </form>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
