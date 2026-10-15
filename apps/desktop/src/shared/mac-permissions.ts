import { z } from 'zod';

export const automationAppSchema = z.enum([
  'calendar',
  'reminders',
  'finder',
  'messages',
  'system_events',
  'safari',
  'chrome',
]);
export type AutomationApp = z.infer<typeof automationAppSchema>;
export const automationStatusSchema = z.enum([
  'ready',
  'needs_permission',
  'denied',
  'not_running',
  'unavailable',
  'error',
]);
export type AutomationStatus = z.infer<typeof automationStatusSchema>;
export type AutomationPermissions = Record<
  'calendar' | 'reminders' | 'finder' | 'messages',
  AutomationStatus
> &
  Partial<Record<'system_events' | 'safari' | 'chrome', AutomationStatus | undefined>>;
export const automationApps = [
  {
    id: 'system_events',
    name: 'System Events',
    detail:
      'Lets Sia use menus and keyboard shortcuts in any app. macOS calls this “System Events”.',
  },
  {
    id: 'safari',
    name: 'Safari',
    detail: 'Lets Sia use Safari, where you’re already signed in.',
  },
  {
    id: 'chrome',
    name: 'Chrome',
    detail: 'Lets Sia use Chrome, where you’re already signed in.',
  },
  { id: 'calendar', name: 'Calendar', detail: 'Lets Sia find events and help plan your day.' },
  { id: 'reminders', name: 'Reminders', detail: 'Lets Sia find and update your reminders.' },
  { id: 'finder', name: 'Finder', detail: 'Lets Sia work with the files you choose.' },
  { id: 'messages', name: 'Messages', detail: 'Lets Sia send texts you approve.' },
] as const;
