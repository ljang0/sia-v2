import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowLeft, Key, LockKey } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { RendererSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import styles from '../../ui.module.css';
import { InlineSettingsError } from './SettingsShared';
import { errorMessage } from '../../plainErrors';

type CloudAuth = RendererSnapshot['cloudAuth'];

export function CloudAccountSettings({
  cloudAuth,
  onStartCloudSignIn,
  onCompleteCloudSignIn,
  onBeginAdminMfa,
  onCompleteAdminMfa,
  onSignOutCloud,
  onDeleteCloudAccount,
  autoFocusEmail = false,
}: {
  cloudAuth: CloudAuth;
  onStartCloudSignIn(email: string): Promise<void>;
  onCompleteCloudSignIn(code: string): Promise<void>;
  onBeginAdminMfa(): Promise<{ secretCode: string }>;
  onCompleteAdminMfa(code: string): Promise<void>;
  onSignOutCloud(): Promise<void>;
  onDeleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<void>;
  autoFocusEmail?: boolean;
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
    if (
      cloudAuth.state === 'code-sent' ||
      cloudAuth.state === 'password-required' ||
      cloudAuth.state === 'mfa-required'
    ) {
      codeInput.current?.focus();
    }
    if (
      cloudAuth.state === 'password-required' ||
      cloudAuth.state === 'mfa-required' ||
      cloudAuth.state === 'signed-in'
    ) {
      setCode('');
    }
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
      () =>
        onCompleteCloudSignIn(
          cloudAuth.state === 'password-required' ? code : code.replaceAll(/\s/g, ''),
        ),
      cloudAuth.state === 'password-required'
        ? 'Sia could not verify that administrator password.'
        : 'Sia could not verify that code.',
    );
  };

  return (
    <div
      className={styles.cloudIdentity}
      aria-labelledby={
        !autoFocusEmail || cloudAuth.state === 'signed-in' ? `${formId}-title` : undefined
      }
      aria-label={
        autoFocusEmail && cloudAuth.state !== 'signed-in' ? 'Sign in to Sia' : undefined
      }
    >
      {!autoFocusEmail || cloudAuth.state === 'signed-in' ? (
        <div className={styles.cloudIdentityHeader}>
          <div>
            <strong id={`${formId}-title`}>Sia cloud account</strong>
            <p>{accountDescription(cloudAuth)}</p>
          </div>
          {cloudAuth.state === 'signed-in' ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              disabled={Boolean(pending)}
              onClick={() =>
                void run('sign-out', onSignOutCloud, 'Sia could not sign out safely.')
              }
            >
              {pending === 'sign-out' ? 'Signing out...' : 'Sign out'}
            </button>
          ) : null}
        </div>
      ) : null}

      {cloudAuth.state === 'signed-out' ? (
        <form className={styles.cloudIdentityForm} onSubmit={start}>
          <label className={dialogs.field}>
            <span>Email</span>
            <input
              type="email"
              autoFocus={autoFocusEmail}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={Boolean(pending)}
              aria-describedby={error ? `${formId}-error` : undefined}
              required
            />
          </label>
          <button
            type="submit"
            className={`${buttons.primaryButton} ${styles.formSubmit}`}
            disabled={Boolean(pending)}
          >
            {pending === 'auth-start' ? 'Sending...' : 'Email me a sign-in code'}
          </button>
          <p className={styles.accountTerms}>
            By continuing, you agree to the{' '}
            <a href="https://superintelligentagents.ai/terms/" target="_blank" rel="noreferrer">
              Terms
            </a>{' '}
            and acknowledge the{' '}
            <a
              href="https://superintelligentagents.ai/privacy/"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>
      ) : null}

      {cloudAuth.state === 'code-sent' ||
      cloudAuth.state === 'password-required' ||
      cloudAuth.state === 'mfa-required' ? (
        <form className={styles.cloudIdentityForm} onSubmit={verify}>
          <div className={dialogs.field}>
            <label htmlFor={`${formId}-code`}>
              {cloudAuth.state === 'password-required'
                ? 'Administrator password'
                : cloudAuth.state === 'mfa-required'
                  ? 'Authenticator code'
                  : 'Sign-in code'}
            </label>
            <input
              id={`${formId}-code`}
              ref={codeInput}
              type={cloudAuth.state === 'password-required' ? 'password' : 'text'}
              inputMode={cloudAuth.state === 'password-required' ? undefined : 'numeric'}
              autoComplete={
                cloudAuth.state === 'password-required' ? 'current-password' : 'one-time-code'
              }
              value={code}
              onChange={(event) =>
                setCode(
                  cloudAuth.state === 'password-required'
                    ? event.target.value.slice(0, 256)
                    : event.target.value.replaceAll(/\D/g, '').slice(0, 10),
                )
              }
              placeholder={
                cloudAuth.state === 'password-required'
                  ? 'Admin password'
                  : cloudAuth.state === 'mfa-required'
                    ? '6-digit code'
                    : 'Code from your email'
              }
              minLength={cloudAuth.state === 'password-required' ? 1 : 6}
              maxLength={
                cloudAuth.state === 'password-required'
                  ? 256
                  : cloudAuth.state === 'mfa-required'
                    ? 6
                    : 10
              }
              pattern={
                cloudAuth.state === 'password-required'
                  ? undefined
                  : cloudAuth.state === 'mfa-required'
                    ? '[0-9]{6}'
                    : '[0-9]{6,10}'
              }
              disabled={Boolean(pending)}
              aria-describedby={`${formId}-code-help${error ? ` ${formId}-error` : ''}`}
              required
            />
            <small id={`${formId}-code-help`}>
              {cloudAuth.state === 'mfa-required'
                ? 'Open the authenticator linked to this admin account.'
                : cloudAuth.state === 'password-required'
                  ? 'This MFA-protected admin signs in with its password, then an authenticator code.'
                  : `Sent to ${cloudAuth.email ?? email}. Codes contain 6-10 digits.`}
            </small>
          </div>
          <button
            type="submit"
            className={`${buttons.primaryButton} ${styles.formSubmit}`}
            disabled={Boolean(pending)}
          >
            {pending === 'auth-complete'
              ? 'Checking...'
              : cloudAuth.state === 'password-required'
                ? 'Continue'
                : cloudAuth.state === 'mfa-required'
                  ? 'Verify authenticator'
                  : 'Verify code'}
          </button>
          {cloudAuth.state === 'code-sent' ? (
            <button
              type="button"
              className={`${buttons.textButton} ${styles.formLink}`}
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
          ) : null}
          <button
            type="button"
            className={`${buttons.textButton} ${styles.formLink}`}
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
        <>
          {cloudAuth.admin ? (
            <AdminMfaSetup
              enabled={Boolean(cloudAuth.adminMfa)}
              onBegin={onBeginAdminMfa}
              onComplete={onCompleteAdminMfa}
            />
          ) : null}
          <DeleteCloudAccountDialog onDelete={onDeleteCloudAccount} />
        </>
      ) : null}

      <div id={`${formId}-error`} ref={errorContainer} tabIndex={-1}>
        <InlineSettingsError message={error} />
      </div>
    </div>
  );
}

function AdminMfaSetup({
  enabled,
  onBegin,
  onComplete,
}: {
  enabled: boolean;
  onBegin(): Promise<{ secretCode: string }>;
  onComplete(code: string): Promise<void>;
}) {
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (enabled) {
    return (
      <div className={styles.adminSecurityReady} role="status">
        <LockKey size={17} weight="fill" aria-hidden="true" />
        <div>
          <strong>Admin access secured</strong>
          <p>Research archive requests require this authenticator.</p>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.adminSecuritySetup} aria-label="Admin authenticator setup">
      <div>
        <Key size={18} aria-hidden="true" />
        <div>
          <strong>Secure research archive access</strong>
          <p>Add this admin account to an authenticator before opening raw participant data.</p>
        </div>
      </div>
      {secret ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError(undefined);
            void onComplete(code)
              .then(() => {
                setSecret(undefined);
                setCode('');
              })
              .catch((cause: unknown) =>
                setError(errorMessage(cause, 'The authenticator could not be verified.')),
              )
              .finally(() => setPending(false));
          }}
        >
          <label className={dialogs.field}>
            <span>Manual setup key</span>
            <code className={styles.mfaSecret}>{secret}</code>
          </label>
          <label className={dialogs.field}>
            <span>6-digit authenticator code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))
              }
              required
            />
          </label>
          <button
            className={buttons.primaryButton}
            type="submit"
            disabled={pending || code.length !== 6}
          >
            {pending ? 'Verifying…' : 'Finish setup'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={buttons.primaryButton}
          disabled={pending}
          onClick={() => {
            setPending(true);
            setError(undefined);
            void onBegin()
              .then(({ secretCode }) => setSecret(secretCode))
              .catch((cause: unknown) =>
                setError(errorMessage(cause, 'Authenticator setup could not start.')),
              )
              .finally(() => setPending(false));
          }}
        >
          {pending ? 'Preparing…' : 'Set up authenticator'}
        </button>
      )}
      <InlineSettingsError message={error} />
    </section>
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
          <button type="button" className={buttons.textButtonDanger}>
            Delete account
          </button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogs.dialogOverlay} />
          <AlertDialog.Content className={dialogs.alertDialogContent}>
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
            <div className={dialogs.dialogActions}>
              <AlertDialog.Cancel asChild>
                <button type="button" className={buttons.secondaryButton} disabled={deleting}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className={buttons.dangerButton}
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
    return `Signed in as ${cloudAuth.email ?? 'your Sia account'}.`;
  }
  if (cloudAuth.state === 'unconfigured') {
    return 'Cloud accounts are unavailable in this build.';
  }
  if (cloudAuth.state === 'code-sent') {
    return 'A one-time code will arrive shortly. Check spam or request a new code.';
  }
  if (cloudAuth.state === 'password-required') {
    return 'This MFA-protected admin account requires its password first.';
  }
  if (cloudAuth.state === 'mfa-required') {
    return 'This admin account also requires its authenticator code.';
  }
  return "Sign in with your email to use Sia's included services and cloud connections.";
}
