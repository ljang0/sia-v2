import { type Dispatch, type SetStateAction, useEffect } from 'react';
import { focusComposer } from '../composerFocus';
import { conversationForShortcut } from '../shortcuts';
import type { useAppController } from '../useAppController';

interface AppShortcutOptions {
  app: ReturnType<typeof useAppController>;
  auditMode: boolean;
  signInRequired: boolean;
  conversationFindOpen: boolean;
  setQuickSwitcherOpen: Dispatch<SetStateAction<boolean>>;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  setConversationFindOpen: Dispatch<SetStateAction<boolean>>;
}

/** Window-wide keys: Esc closes a page or stops the task, and the ⌘ shortcuts. */
export function useAppShortcuts({
  app,
  auditMode,
  signInRequired,
  conversationFindOpen,
  setQuickSwitcherOpen,
  setShortcutsOpen,
  setConversationFindOpen,
}: AppShortcutOptions) {
  useEffect(() => {
    if (auditMode || signInRequired) return undefined;
    // macOS text fields use Control+B/F/N/K for cursor movement, so only Command is ours there.
    const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (app.activityOpen || app.settingsOpen) &&
        !event.defaultPrevented
      ) {
        const target = event.target as HTMLElement | null;
        const clearingField =
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          target.value !== '';
        if (!clearingField && !document.querySelector('[role="dialog"], [role="menu"]')) {
          if (app.activityOpen) app.closeActivity();
          else app.closeSettings();
          return;
        }
      }
      // Esc stops the running task, unless it is closing something else first.
      const running = app.snapshot?.activeThread;
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        running?.status === 'running' &&
        !app.activityOpen &&
        !app.settingsOpen &&
        !conversationFindOpen &&
        !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')
      ) {
        event.preventDefault();
        void app.run(() => app.api.cancelTurn(running.id)).then(() => focusComposer());
        return;
      }
      const modifier = mac ? event.metaKey && !event.ctrlKey : event.metaKey || event.ctrlKey;
      if (!modifier || event.altKey) return;
      const key = event.key.toLocaleLowerCase();
      // ⌘1–9 open the conversations listed in the sidebar, in order.
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1] ?? /^[1-9]$/.exec(key)?.[0];
      if (digit && !event.shiftKey && app.snapshot) {
        const threadId = conversationForShortcut(app.snapshot.agents, Number(digit));
        if (!threadId) return;
        event.preventDefault();
        setQuickSwitcherOpen(false);
        setShortcutsOpen(false);
        app.closeSettings();
        app.closeActivity();
        void app.run(() => app.api.selectThread(threadId)).then(() => focusComposer());
        return;
      }
      if (key === '/' || event.code === 'Slash') {
        event.preventDefault();
        setQuickSwitcherOpen(false);
        setShortcutsOpen((current) => !current);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        setQuickSwitcherOpen((current) => !current);
      } else if (key === 'f') {
        event.preventDefault();
        setQuickSwitcherOpen(false);
        if (app.snapshot?.activeThread && !app.settingsOpen && !app.activityOpen) {
          setConversationFindOpen(true);
        } else {
          app.openActivity('search');
        }
      } else if (key === 'b') {
        event.preventDefault();
        setQuickSwitcherOpen(false);
        app.toggleSidebar();
      } else if (key === ',') {
        event.preventDefault();
        setQuickSwitcherOpen(false);
        app.openSettings();
      } else if (key === 'n' && app.snapshot?.selectedAgentId) {
        event.preventDefault();
        setQuickSwitcherOpen(false);
        const agentId = app.snapshot.selectedAgentId;
        app.closeSettings();
        app.closeActivity();
        void app.run(() => app.api.createThread(agentId)).then(() => focusComposer());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    app,
    auditMode,
    signInRequired,
    conversationFindOpen,
    setQuickSwitcherOpen,
    setShortcutsOpen,
    setConversationFindOpen,
  ]);
}
