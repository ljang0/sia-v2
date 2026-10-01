import type { TextSize, ThemePreference } from '../display.js';
import type { ApprovalView } from './approvals.js';
import type { BrowserView, ComputerView, VoiceView } from './computer.js';
import type { ConnectionView } from './connections.js';
import type { ProviderUsageView, ProviderView } from './providers.js';
import type { CaptureView } from './research.js';
import type { ScheduleView } from './schedules.js';
import type { AgentView, ThreadPreview, ThreadView, TimelineItemView } from './threads.js';

// The desktop state the main process pushes to the renderer.

export interface UpdateView {
  status: 'unconfigured' | 'idle' | 'checking' | 'available' | 'current' | 'error';
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  detail: string;
}

export interface DesktopSnapshot {
  revision: number;
  agents: AgentView[];
  threads: ThreadView[];
  /**
   * The full history for in-process callers. Snapshots pushed to the renderer carry only the
   * active thread's items and summarize every other thread in `previews`.
   */
  timeline: TimelineItemView[];
  previews?: Record<string, ThreadPreview>;
  approvals: ApprovalView[];
  providers: ProviderView[];
  connections: ConnectionView[];
  capture: CaptureView;
  computer: ComputerView;
  browser: BrowserView;
  voice: VoiceView;
  preferences: {
    completionSound: boolean;
    openAtLogin?: boolean;
    appearance?: 'calm' | 'expressive';
    /** Light or dark follows the Mac unless set. Applies to every Sia window. */
    theme?: ThemePreference;
    /** Scales Sia's type. Default when unset. */
    textSize?: TextSize;
    /** Shows the workspace Command tool. Off unless turned on in Settings; main enforces it. */
    developerTools?: boolean;
    onboarding?: OnboardingProgress;
  };
  providerUsage?: ProviderUsageView[];
  updates?: UpdateView;
  schedules?: ScheduleView[];
  activeAgentId?: string;
  activeThreadId?: string;
  cloud: {
    status: 'offline' | 'connecting' | 'online' | 'error';
    auth:
      | 'unconfigured'
      | 'signed_out'
      | 'code_sent'
      | 'password_required'
      | 'mfa_required'
      | 'signed_in';
    account?: string;
    admin?: boolean;
    participant?: boolean;
    adminMfa?: boolean;
    features?: CloudFeatureFlags;
  };
  startupNotice?: {
    title: string;
    detail: string;
  };
}

export interface CloudFeatureFlags {
  researchUploads: boolean;
  researchArchive: boolean;
  connectors: boolean;
  schedules: boolean;
}

export type OnboardingStep =
  | 'welcome'
  | 'agent'
  | 'voice'
  | 'access'
  | 'apps'
  | 'restart'
  | 'verify'
  | 'practice'
  | 'complete';
export interface OnboardingProgress {
  step: OnboardingStep;
  agentId?: string;
  restartPending?: boolean;
  restarted?: boolean;
  /** `skipped` lists optional checklist rows the person skipped, so a relaunch does not re-ask. */
  permissionSetup?: { includeApps: boolean; active: boolean; skipped?: string[] };
}
