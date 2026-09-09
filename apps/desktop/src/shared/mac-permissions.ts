import { z } from 'zod';

export const automationAppSchema = z.enum(['calendar', 'reminders', 'finder', 'messages']);
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
export type AutomationPermissions = Record<AutomationApp, AutomationStatus>;
export const automationApps = [
  { id: 'calendar', name: 'Calendar', detail: 'Find events and plan your schedule.' },
  { id: 'reminders', name: 'Reminders', detail: 'Find and manage your reminders.' },
  { id: 'finder', name: 'Finder', detail: 'Work with the files you select.' },
  {
    id: 'messages',
    name: 'Messages',
    detail: 'Send messages you approve. History also needs Full Disk Access.',
  },
] as const;
export const automationStatusLabel: Record<AutomationStatus, string> = {
  ready: 'Allowed',
  needs_permission: 'Needs access',
  denied: 'Allow in System Settings',
  not_running: 'Open app to check access',
  unavailable: 'Unavailable on this Mac',
  error: 'Could not check access',
};
