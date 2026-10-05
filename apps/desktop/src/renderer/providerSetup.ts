import type { ProviderSetup } from './types';

export function providerStatusLabel(provider: ProviderSetup) {
  if (provider.status === 'ready') return provider.id === 'meta' ? 'Available' : 'Installed';
  return {
    'needs-install': 'Not installed',
    'needs-login': 'Sign-in required',
    incompatible: 'Incompatible',
    unavailable: 'Unavailable',
    disabled: 'Not available yet',
  }[provider.status];
}
