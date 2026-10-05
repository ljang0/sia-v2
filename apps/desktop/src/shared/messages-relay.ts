import { z } from 'zod';

export const messagesRelayCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('enable'), agentId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('disable') }).strict(),
  z
    .object({
      operation: z.literal('trust'),
      handle: z.string().trim().min(3).max(100),
      label: z.string().trim().max(60),
    })
    .strict(),
  z
    .object({ operation: z.literal('untrust'), handle: z.string().trim().min(1).max(100) })
    .strict(),
  z.object({ operation: z.literal('preferences'), proactive: z.boolean() }).strict(),
]);
export type MessagesRelayCommand = z.infer<typeof messagesRelayCommand>;

/**
 * One of the person's own phone numbers or iCloud emails. Texts from it reach Sia, and so do
 * texts the person sends to it from this Mac's Apple ID (texting yourself).
 */
export interface TrustedContact {
  /** Normalized: +E.164 digits for phone numbers, lowercase for emails. */
  handle: string;
  label: string;
}

export interface MessagesRelaySettings {
  enabled: boolean;
  running: boolean;
  agentId?: string;
  trusted: TrustedContact[];
  /** Text your first number when scheduled tasks finish or need you. */
  proactive: boolean;
  access: 'ready' | 'needs_full_disk_access' | 'unavailable';
  detail: string;
}
export type MessagesRelayApi = (
  command: MessagesRelayCommand,
) => Promise<MessagesRelaySettings>;

/** Returns a comparable handle, or undefined when the input is neither a phone number nor email. */
export function normalizeHandle(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
  }
  if (!/^[+\d\s().-]+$/.test(trimmed)) return undefined;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+'))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}
