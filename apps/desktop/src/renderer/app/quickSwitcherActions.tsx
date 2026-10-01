import {
  Archive,
  CalendarDots,
  ChatCircle,
  EnvelopeSimple,
  GearSix,
  Keyboard,
  MagnifyingGlass,
  Plus,
  Pulse,
} from '@phosphor-icons/react';
import type { QuickSwitcherAction } from '../components/QuickSwitcher';
import { focusComposer } from '../composerFocus';
import type { AgentSummary } from '../types';
import type { useAppController } from '../useAppController';

interface QuickSwitcherActionOptions {
  app: ReturnType<typeof useAppController>;
  selectedAgent: AgentSummary | undefined;
  openShortcuts(): void;
  openFeedback(): void;
}

/** The commands ⌘K offers beside conversations and agents. */
export function quickSwitcherActions({
  app,
  selectedAgent,
  openShortcuts,
  openFeedback,
}: QuickSwitcherActionOptions): QuickSwitcherAction[] {
  const { api, run } = app;
  return [
    ...(selectedAgent
      ? [
          {
            id: 'new-thread',
            label: 'New conversation',
            detail: `Start in ${selectedAgent.name}`,
            keywords: 'new chat task thread',
            icon: <ChatCircle size={17} />,
            opensConversation: true,
            run: () => {
              app.closeSettings();
              app.closeActivity();
              void run(() => api.createThread(selectedAgent.id)).then(() => focusComposer());
            },
          },
        ]
      : []),
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard shortcuts',
      detail: '⌘/',
      keywords: 'keys hotkeys help',
      icon: <Keyboard size={17} />,
      run: openShortcuts,
    },
    {
      id: 'feedback',
      label: 'Send feedback',
      detail: 'Review a note in your mail app',
      keywords: 'bug issue suggestion support',
      icon: <EnvelopeSimple size={17} />,
      run: openFeedback,
    },
    {
      id: 'new-agent',
      label: 'New agent',
      detail: 'Start another kind of work',
      keywords: 'new room assistant',
      icon: <Plus size={17} />,
      run: () => {
        app.closeSettings();
        app.closeActivity();
        app.openNewAgent();
      },
    },
    {
      id: 'search-transcripts',
      label: 'Search all conversations',
      detail: 'Every message, including archived ones',
      keywords: 'find messages history transcripts',
      icon: <MagnifyingGlass size={17} />,
      run: () => app.openActivity('search'),
    },
    {
      id: 'activity',
      label: 'Open Activity',
      detail: 'Running and unread work',
      keywords: 'tasks status',
      icon: <Pulse size={17} />,
      run: () => app.openActivity('activity'),
    },
    {
      id: 'scheduled',
      label: 'Open Scheduled',
      detail: 'Everything set to run later or on repeat',
      keywords: 'schedules automations recurring later timer',
      icon: <CalendarDots size={17} />,
      run: () => app.openActivity('scheduled'),
    },
    {
      id: 'archived',
      label: 'Open archived conversations',
      detail: 'Restore or revisit a conversation',
      keywords: 'history old threads',
      icon: <Archive size={17} />,
      run: () => app.openActivity('archived'),
    },
    {
      id: 'settings',
      label: 'Open Settings',
      detail: 'AI, connections, computer, voice, privacy',
      keywords: 'preferences configuration',
      icon: <GearSix size={17} />,
      run: () => app.openSettings(),
    },
  ];
}
