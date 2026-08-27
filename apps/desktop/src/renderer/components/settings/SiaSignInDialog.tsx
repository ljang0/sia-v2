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
              <h2>A companion for the work between ideas and done.</h2>
              <p>
                Give each kind of work its own agent, its own room, and a thread you can return
                to without starting over.
              </p>
            </div>
          </aside>
          <section className={companion.onboardingPanel}>
            <header>
              <Dialog.Title>Sign in to Sia</Dialog.Title>
              <Dialog.Description>
                Start with Sia&apos;s included model. You can connect a ChatGPT plan for Codex
                later.
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
