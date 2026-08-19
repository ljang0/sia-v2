import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowLeft } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError } from './SettingsShared';

type CloudAuth = RendererSnapshot['cloudAuth'];

export function CloudAccountSettings({
  cloudAuth,
  onStartCloudSignIn,
  onCompleteCloudSignIn,
  onSignOutCloud,
  onDeleteCloudAccount,
}: {
  cloudAuth: CloudAuth;
  onStartCloudSignIn(email: string): Promise<void>;
  onCompleteCloudSignIn(code: string): Promise<void>;
  onSignOutCloud(): Promise<void>;
  onDeleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<void>;
}) {
  const [email, setEmail] = useState(cloudAuth.email ?? '');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);
  const errorContainer = useRef<HTMLDivElement>(null);
  const formId = useId();

  useEffect(() => {
    if (cloudAuth.email) setEmail(cloudAuth.email);
    if (cloudAuth.state === 'code-sent') codeInput.current?.focus();
    if (cloudAuth.state === 'signed-in') setCode('');
  }, [cloudAuth.email, cloudAuth.state]);

  useEffect(() => {
    if (error) errorContainer.current?.focus();
  }, [error]);

  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setPending(key);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, fallback));
    } finally {
      setPending(undefined);
    }
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    void run(
      'auth-start',
      () => onStartCloudSignIn(email.trim().toLowerCase()),
      'Sia could not send a sign-in code.',
    );
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run(
      'auth-complete',
      () => onCompleteCloudSignIn(code.replaceAll(/\s/g, '')),
      'Sia could not verify that code.',
    );
  };

  return (
    <div className={styles.cloudIdentity} aria-labelledby={`${formId}-title`}>
      <div className={styles.cloudIdentityHeader}>
        <div>
          <strong id={`${formId}-title`}>Sia cloud account</strong>
          <p>{accountDescription(cloudAuth)}</p>
        </div>
        {cloudAuth.state === 'signed-in' ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() =>
              void run('sign-out', onSignOutCloud, 'Sia could not sign out safely.')
            }
          >
            {pending === 'sign-out' ? 'Signing out...' : 'Sign out & clear local research'}
          </button>
        ) : null}
      </div>

      {cloudAuth.state === 'signed-out' ? (
        <form className={styles.cloudIdentityForm} onSubmit={start}>
          <label className={styles.field}>
            <span>Invited email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={Boolean(pending)}
              aria-describedby={error ? `${formId}-error` : undefined}
              required
            />
          </label>
          <button type="submit" className={styles.primaryButton} disabled={Boolean(pending)}>
            {pending === 'auth-start' ? 'Sending...' : 'Email me a code'}
          </button>
        </form>
      ) : null}

      {cloudAuth.state === 'code-sent' ? (
        <form className={styles.cloudIdentityForm} onSubmit={verify}>
          <div className={styles.field}>
            <label htmlFor={`${formId}-code`}>Sign-in code</label>
            <input
              id={`${formId}-code`}
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 10))
              }
              placeholder="8-digit code"
              minLength={6}
              maxLength={10}
              pattern="[0-9]{6,10}"
              disabled={Boolean(pending)}
              aria-describedby={`${formId}-code-help${error ? ` ${formId}-error` : ''}`}
              required
            />
            <small id={`${formId}-code-help`}>
              Sent to {cloudAuth.email ?? email}. Codes contain 6-10 digits.
            </small>
          </div>
          <button type="submit" className={styles.primaryButton} disabled={Boolean(pending)}>
            {pending === 'auth-complete' ? 'Checking...' : 'Verify code'}
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={Boolean(pending)}
            onClick={() => {
              setCode('');
              void run(
                'auth-start',
                () => onStartCloudSignIn(email.trim().toLowerCase()),
                'Sia could not send a new code.',
              );
            }}
          >
            Send a new code
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={Boolean(pending)}
            onClick={() => void run('sign-out', onSignOutCloud, 'Sia could not reset sign-in.')}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Use another email
          </button>
        </form>
      ) : null}

      {cloudAuth.state === 'unconfigured' ? (
        <div className={styles.cloudUnavailable} role="status">
          Local mode is ready. No Sia account or cloud credits are required.
        </div>
      ) : null}

      {cloudAuth.state === 'signed-in' ? (
        <DeleteCloudAccountDialog onDelete={onDeleteCloudAccount} />
      ) : null}

      <div id={`${formId}-error`} ref={errorContainer} tabIndex={-1}>
        <InlineSettingsError message={error} />
      </div>
    </div>
  );
}

function DeleteCloudAccountDialog({
  onDelete,
}: {
  onDelete(confirmation: 'DELETE ACCOUNT'): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <div className={styles.cloudDangerZone}>
      <div>
        <strong>Delete Sia cloud account</strong>
        <p>Removes Sia account data. Files in your workspaces and provider accounts remain.</p>
      </div>
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
          if (!next) {
            setConfirmation('');
            setError(undefined);
          }
        }}
      >
        <AlertDialog.Trigger asChild>
          <button type="button" className={styles.textButtonDanger}>
            Delete account
          </button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.alertDialogContent}>
            <AlertDialog.Title>Delete your Sia cloud account?</AlertDialog.Title>
            <AlertDialog.Description>
              Sia first waits for the cloud deletion job to remove synced research, staged
              uploads, connected-app access, and your cloud identity. Only after the cloud
              confirms completion will this Mac erase Sia agents, threads, approvals, settings,
              and its Sia sign-in. This cannot be undone. Workspace files, provider CLI
              accounts, and macOS permissions are not removed.
            </AlertDialog.Description>
            <label className={styles.confirmationField} htmlFor={inputId}>
              <span>
                Type <strong>DELETE ACCOUNT</strong> to continue
              </span>
              <input
                id={inputId}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                disabled={deleting}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error ? (
              <div ref={errorRef} className={styles.dialogError} role="alert" tabIndex={-1}>
                {error}
              </div>
            ) : null}
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild>
                <button type="button" className={styles.secondaryButton} disabled={deleting}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={deleting || confirmation !== 'DELETE ACCOUNT'}
                onClick={async () => {
                  if (confirmation !== 'DELETE ACCOUNT') return;
                  setDeleting(true);
                  setError(undefined);
                  try {
                    await onDelete('DELETE ACCOUNT');
                    setOpen(false);
                  } catch (cause) {
                    setError(
                      errorMessage(cause, 'Your Sia cloud account could not be deleted.'),
                    );
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Deleting account...' : 'Permanently delete account'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function accountDescription(cloudAuth: CloudAuth) {
  if (cloudAuth.state === 'signed-in') {
    return `Signed in as ${cloudAuth.email ?? 'your invited account'}. Signing out turns research capture off and clears local research records; connected apps stay linked and locked until this account signs in again.`;
  }
  if (cloudAuth.state === 'unconfigured') {
    return 'Optional cloud sync and connected apps can be added later.';
  }
  if (cloudAuth.state === 'code-sent') {
    return 'Check your email, then enter the one-time code below.';
  }
  return 'Sign in with an invited email before connecting Gmail, Drive, or Slack.';
}
