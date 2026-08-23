import * as Dialog from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
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
        <Dialog.Content className={styles.dialogContent}>
          <div className={styles.dialogHeader}>
            <div>
              <Dialog.Title>Sign in to Sia</Dialog.Title>
              <Dialog.Description>
                Join the research release, then connect your work apps in one guided setup.
                Local work remains available.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.iconButton} aria-label="Close sign-in">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
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
            <Dialog.Close asChild>
              <button type="button" className={styles.secondaryButton}>
                Continue locally
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
