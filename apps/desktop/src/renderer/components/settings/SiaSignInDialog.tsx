import * as Dialog from '@radix-ui/react-dialog';
import type { RendererSnapshot } from '../../types';
import companion from '../../companion.module.css';
import { AgentForm } from '../AgentForm';
import { CloudAccountSettings } from './CloudAccountSettings';

export function SiaSignInDialog({
  cloudAuth,
  onStart,
  onComplete,
  onBeginAdminMfa,
  onCompleteAdminMfa,
  onSignOut,
  onDelete,
}: {
  cloudAuth: RendererSnapshot['cloudAuth'];
  onStart(email: string): Promise<void>;
  onComplete(code: string): Promise<void>;
  onBeginAdminMfa(): Promise<{ secretCode: string }>;
  onCompleteAdminMfa(code: string): Promise<void>;
  onSignOut(): Promise<void>;
  onDelete(confirmation: 'DELETE ACCOUNT'): Promise<void>;
}) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Content
          className={companion.onboardingDialog}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <aside className={companion.onboardingVisual} aria-hidden="true">
            <div className={companion.onboardingBrand}>
              <AgentForm identity={3} size="medium" />
              <span>Sia</span>
            </div>
            <div>
              <h2>Your helper for everyday tasks.</h2>
              <p>
                Ask in plain words. Sia works in the apps you already use, and you stay in
                charge.
              </p>
            </div>
          </aside>
          <section className={companion.onboardingPanel}>
            <header>
              <Dialog.Title>Sign in to Sia</Dialog.Title>
              <Dialog.Description>{signInHint(cloudAuth.state)}</Dialog.Description>
            </header>
            <div className={companion.onboardingSignIn}>
              <CloudAccountSettings
                cloudAuth={cloudAuth}
                autoFocusEmail
                onStartCloudSignIn={onStart}
                onCompleteCloudSignIn={onComplete}
                onBeginAdminMfa={onBeginAdminMfa}
                onCompleteAdminMfa={onCompleteAdminMfa}
                onSignOutCloud={onSignOut}
                onDeleteCloudAccount={onDelete}
              />
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One plain sentence for where the person is in email sign-in. */
function signInHint(state: RendererSnapshot['cloudAuth']['state']): string {
  if (state === 'code-sent')
    return 'Check your inbox for a one-time code. It can take a minute.';
  if (state === 'mfa-required') return 'Enter the code from your authenticator app.';
  if (state === 'password-required') return 'Enter the administrator password to continue.';
  return 'Sign in or create your account with an email code. No password needed.';
}
