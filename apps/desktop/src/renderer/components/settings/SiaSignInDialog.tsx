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
              <h2>One place to ask, review, and keep going.</h2>
              <p>Keep each kind of work with the instructions, files, and history it needs.</p>
            </div>
          </aside>
          <section className={companion.onboardingPanel}>
            <header>
              <Dialog.Title>Sign in to Sia</Dialog.Title>
              <Dialog.Description>
                Enter the email invited to the pilot. We&apos;ll send a one-time code—no
                password required.
              </Dialog.Description>
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
