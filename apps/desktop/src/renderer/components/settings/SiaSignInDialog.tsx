import * as Dialog from '@radix-ui/react-dialog';
import { Flask, Laptop, X } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import companion from '../../companion.module.css';
import styles from '../../ui.module.css';
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
  const [dismissed, setDismissed] = useState(false);

  return (
    <Dialog.Root open={!dismissed} onOpenChange={(open) => !open && setDismissed(true)}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={companion.onboardingDialog}>
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
            <Dialog.Close asChild>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close sign-in"
                title="Continue locally"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
            <header>
              <Dialog.Title>Choose how Sia starts</Dialog.Title>
              <Dialog.Description>
                Local mode works now. Invited research participants can also sign in for
                consented research sync and staged cloud features.
              </Dialog.Description>
            </header>
            <div className={companion.onboardingModes}>
              <div className={companion.onboardingMode}>
                <Laptop size={27} aria-hidden="true" />
                <div>
                  <strong>Work locally</strong>
                  <span>
                    Your agents, threads, workspaces, and provider accounts stay on this Mac.
                  </span>
                </div>
              </div>
              <div className={companion.onboardingMode}>
                <Flask size={27} aria-hidden="true" />
                <div>
                  <strong>Join by invitation</strong>
                  <span>
                    Use the email named in your study invite. Connected apps are available only
                    to the smaller acceptance-testing cohort.
                  </span>
                </div>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className={`${styles.secondaryButton} ${companion.onboardingLocalButton}`}
              >
                Start in local mode
              </button>
            </Dialog.Close>
            <div className={styles.signInDialogBody}>
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
