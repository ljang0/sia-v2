import { z } from 'zod';
import type { AgentView } from './bridge.js';

export function phoneAssistantBlocker(
  agent: Pick<AgentView, 'name' | 'provider' | 'model'> | undefined,
  providers:
    | readonly {
        id: string;
        status: string;
        model: string;
        models?: readonly { id: string }[] | undefined;
      }[]
    | undefined,
): string | undefined {
  if (!agent)
    return 'The phone assistant was removed. Choose one in Sia’s Phone remote settings.';
  if (!agent.provider || !providers?.length) return undefined;
  const provider = providers.find((entry) => entry.id === agent.provider);
  if (!provider || provider.status !== 'ready')
    return provider?.id === 'codex'
      ? 'Codex is not ready on your Mac. Open Sia → Settings → AI, reconnect your ChatGPT plan, then try again.'
      : 'This assistant’s model is not ready on your Mac. Open Sia and check its AI settings, then try again.';
  if (
    provider.models?.length
      ? !provider.models.some((model) => model.id === agent.model)
      : agent.model !== provider.model
  )
    return `${agent.name} uses a model that is no longer available. Open that assistant’s settings on your Mac and choose an available model, then try again.`;
  return undefined;
}

export const phoneRemoteCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('enable'), agentId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('disable') }).strict(),
  z.object({ operation: z.literal('rotate') }).strict(),
  z.object({ operation: z.literal('copy') }).strict(),
  // Phone access over the internet through the encrypted relay (docs/phone-cloud-relay.md).
  z.object({ operation: z.literal('pair') }).strict(),
  z.object({ operation: z.literal('revoke'), deviceId: z.string().uuid() }).strict(),
]);
export type PhoneRemoteCommand = z.infer<typeof phoneRemoteCommand>;
export interface PhoneRemoteSettings {
  enabled: boolean;
  running: boolean;
  agentId?: string;
  url?: string;
  qr?: string;
  detail: string;
  /** Present when this build reaches phones through the encrypted relay instead of Wi-Fi. */
  relay?: {
    connected: boolean;
    devices: { deviceId: string; pairedAt: string; online: boolean }[];
    /** The pairing QR for a phone being added; it holds that phone's credential and key. */
    pairingQr?: string;
  };
}
export interface RemoteTurn {
  id: string;
  text: string;
  response: string;
  status: 'working' | 'waiting' | 'done' | 'error' | 'cancelled';
  steps: string[];
  error: string;
  files: string[];
  /** Host-minted result grants, keyed by the displayed filename. Old outbox replies omit this. */
  fileIds?: Record<string, string>;
  /** What the Mac is waiting to approve, when a phone task is paused on an approval. */
  approval?: string;
  /** The pending approval's id, for phones allowed to answer it (see RemoteState.canApprove). */
  approvalId?: string;
  /** A finished task the owner's own phone may rate, with the current rating if any. */
  rateable?: true;
  rating?: 'good' | 'bad';
}
export interface RemoteState {
  agent: string;
  mode: 'mac' | 'connected';
  approval: 'auto' | 'ask';
  /** True over the encrypted relay: this phone may approve or deny a pending step. */
  canApprove?: boolean;
  session: string | null;
  turns: RemoteTurn[];
  workers: number;
}
export interface RemoteNote {
  id: string;
  title: string;
  kind: 'memory' | 'skill' | 'journal' | 'workflow' | 'topic';
  content: string;
}
export interface RemoteVault {
  nodes: Omit<RemoteNote, 'content'>[];
  edges: [string, string][];
}
export type PhoneRemoteApi = (command: PhoneRemoteCommand) => Promise<PhoneRemoteSettings>;
