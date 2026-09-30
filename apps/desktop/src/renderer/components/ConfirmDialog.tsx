import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import styles from '../ui.module.css';

export interface ConfirmRequest {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): unknown;
}

/**
 * The one confirmation dialog for destructive or risky settings actions. Render it once per
 * component and open it with a request; the action runs only after the person confirms.
 */
function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | undefined;
  onClose(): void;
}) {
  // Keep the last request on screen while the dialog animates closed, so its text never blanks.
  const shown = useRef(request);
  if (request) shown.current = request;
  const content = shown.current;
  return (
    <AlertDialog.Root open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.dialogOverlay} />
        <AlertDialog.Content className={styles.alertDialogContent}>
          <AlertDialog.Title>{content?.title}</AlertDialog.Title>
          <AlertDialog.Description>{content?.description}</AlertDialog.Description>
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={styles.secondaryButton}>
                {content?.cancelLabel ?? 'Cancel'}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  const action = request?.onConfirm;
                  onClose();
                  void action?.();
                }}
              >
                {content?.confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function useConfirmDialog(): [(request: ConfirmRequest) => void, ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest>();
  const close = useCallback(() => setRequest(undefined), []);
  return [setRequest, <ConfirmDialog key="confirm" request={request} onClose={close} />];
}
