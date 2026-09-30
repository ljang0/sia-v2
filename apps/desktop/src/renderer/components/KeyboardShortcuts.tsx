import * as Dialog from '@radix-ui/react-dialog';
import { KEYBOARD_SHORTCUTS } from '../shortcuts';
import styles from '../ui.module.css';

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** ⌘/ lists the app's keyboard shortcuts. */
export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.alertDialogContent} aria-describedby={undefined}>
          <Dialog.Title>Keyboard shortcuts</Dialog.Title>
          <dl className={styles.shortcutList}>
            {KEYBOARD_SHORTCUTS.map(({ keys, label }) => (
              <div key={keys}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          <div className={styles.dialogActions}>
            <Dialog.Close asChild>
              <button type="button" className={styles.secondaryButton}>
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
