// Mac access: computer control, signed-in Chrome, push-to-talk, and voice.

export interface ComputerPermissionsView {
  status: 'unavailable' | 'needs_permission' | 'ready' | 'error';
  accessibility: boolean;
  screenRecording: boolean;
  /** Granted in System Settings, but macOS applies it to Sia only after one relaunch. */
  relaunchFor?: ('accessibility' | 'screenRecording')[];
  detail?: string;
}

export interface ComputerView extends ComputerPermissionsView {
  accessMode?: 'mac' | 'connected';
  backgroundControl?: boolean;
  backgroundFallback?: 'pause' | 'foreground';
  automation?: import('../mac-permissions.js').AutomationPermissions;
  /** Local Apple Messages readability; sends additionally prompt for Automation once. */
  messagesAccess?: 'ready' | 'needs_full_disk_access' | 'unavailable';
  /** Chrome's own remote-debugging toggle, read-only; Sia never changes it. */
  chromeConnection?: 'enabled' | 'off' | 'unavailable';
  /**
   * 'auto': computer and browser actions run without per-action approval and Chrome
   * attaches to the frontmost window on demand. 'ask' restores confirmation previews.
   */
  trust: 'auto' | 'ask';
  /** Whether the local trajectory log is kept for turns allowed by the connector data policy. */
  trajectoryLog: boolean;
  trajectoryDirectory?: string;
}

export interface BrowserWindowView {
  id: number;
  label: string;
  detail?: string;
}

export interface BrowserView {
  status: 'detached' | 'attaching' | 'attached' | 'error';
  browser?: string;
  profileLabel?: string;
  grantedOrigins: string[];
  availableWindows?: BrowserWindowView[];
  detail?: string;
}

export interface PushToTalkView {
  speakReplies?: boolean;
  available: boolean;
  enabled: boolean;
  agentId?: string;
  accessibility: boolean;
  microphone?: boolean;
  phase: 'idle' | 'starting' | 'listening' | 'transcribing' | 'error';
  detail?: string | undefined;
}

export interface VoiceView {
  engine?: 'macos' | 'elevenlabs';
  dictationAvailable?: boolean;
  dictationDetail?: string | undefined;
  speechRecognition?: 'allowed' | 'denied' | 'not-requested' | undefined;
  pushToTalk?: PushToTalkView;
  status: 'disconnected' | 'connected';
  selectedVoiceId?: string;
  selectedVoiceName?: string;
  voices: Array<{ id: string; name: string; category?: string }>;
  detail?: string;
}
