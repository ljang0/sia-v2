import type { ProviderSetup } from './types';

export function providerStatusLabel(provider: ProviderSetup) {
  if (provider.status === 'ready') return provider.id === 'meta' ? 'Available' : 'Installed';
  return {
    'needs-install': 'Not installed',
    'needs-login': 'Sign-in required',
    incompatible: 'Incompatible',
    unavailable: 'Unavailable',
    disabled: 'Not in alpha',
  }[provider.status];
}

export function providerSetupLabel(provider: ProviderSetup) {
  if (provider.id === 'meta' && provider.status === 'needs-login') {
    return 'Sign in to Sia cloud';
  }
  return {
    ready: 'Recheck',
    'needs-install': 'Open install guide',
    'needs-login': 'Open sign-in guide',
    incompatible: 'Open compatibility guide',
    unavailable: 'Recheck',
    disabled: 'Unavailable',
  }[provider.status];
}

export function providerSetupHref(provider: ProviderSetup) {
  if (
    provider.status === 'ready' ||
    provider.status === 'unavailable' ||
    provider.status === 'disabled'
  ) {
    return undefined;
  }
  if (provider.id === 'codex') {
    return provider.status === 'needs-login'
      ? 'https://learn.chatgpt.com/docs/auth'
      : 'https://learn.chatgpt.com/docs/codex/cli';
  }
  if (provider.id === 'gemini') {
    return provider.status === 'needs-login'
      ? 'https://geminicli.com/docs/get-started/authentication/'
      : 'https://geminicli.com/docs/get-started/installation/';
  }
  return undefined;
}

export function providerReadinessMessage(provider: ProviderSetup) {
  return {
    ready: '',
    'needs-install': `Install ${provider.name}, then recheck before creating this agent.`,
    'needs-login':
      provider.id === 'meta'
        ? 'Sign in to Sia cloud before creating a Meta agent.'
        : `Sign in through ${provider.name}'s official client, then recheck.`,
    incompatible: `Update ${provider.name} to a compatible release, then recheck.`,
    unavailable: `${provider.name} is not available in this build or environment.`,
    disabled: `${provider.name} is not available in this alpha.`,
  }[provider.status];
}
