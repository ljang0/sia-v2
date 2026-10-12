// Model providers, their models and plan usage, and the execution route a thread pins.

export type ProviderId = 'codex' | 'meta' | 'grok' | 'gemini' | 'claude' | 'byok' | 'lab';

/** Safe catalog id. Executability still requires an audited runtime registration. */
export type HarnessId = string;

export interface ResolvedExecutionTargetView {
  provider: ProviderId;
  model: string;
  harnessId: HarnessId;
  harnessModelId: string;
  credentialSource: 'provider_subscription' | 'provider_api' | 'sia_managed' | 'user_byok';
  resolutionSource: 'user' | 'backend_default' | 'legacy_default';
}

export type ProviderStatus =
  'ready' | 'needs_install' | 'needs_login' | 'incompatible' | 'disabled' | 'unavailable';

export interface ProviderSetupProgress {
  phase: 'installing' | 'restarting' | 'signing-in' | 'checking' | 'error';
  message: string;
}

export interface ProviderView {
  id: ProviderId;
  label: string;
  /** Plan wording from the provider catalog, e.g. "ChatGPT plan". */
  plan?: string;
  status: ProviderStatus;
  model: string;
  version?: string;
  account?: string;
  detail: string;
  billing: string;
  restriction?: string;
  models?: ProviderModelView[];
  setup?: ProviderSetupProgress;
  /** Latest plan usage window the provider reported this session. */
  limits?: ProviderUsageLimitView;
}

export interface ProviderUsageLimitView {
  /** 0–100. */
  usedPercent: number;
  /** ISO time the window resets. */
  resetsAt?: string;
  windowMinutes?: number;
  updatedAt: string;
}

export interface ProviderModelView {
  id: string;
  label: string;
  description: string;
  reasoningEfforts: string[];
  defaultReasoningEffort?: string;
}

export interface ProviderUsageView {
  provider: ProviderId;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  lastUsedAt: string;
  providerReported: true;
}
