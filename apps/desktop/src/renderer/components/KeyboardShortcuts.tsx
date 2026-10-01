import * as Dialog from '@radix-ui/react-dialog';
import { KEYBOARD_SHORTCUTS } from '../shortcuts';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import styles from './KeyboardShortcuts.module.css';

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** ⌘/ lists the app's keyboard shortcuts. */
export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogs.dialogOverlay} />
        <Dialog.Content className={dialogs.alertDialogContent} aria-describedby={undefined}>
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
          <div className={dialogs.dialogActions}>
            <Dialog.Close asChild>
              <button type="button" className={buttons.secondaryButton}>
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
