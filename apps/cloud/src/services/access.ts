import type { AuthContext } from '../contracts.js';
import { CloudError } from '../domain.js';
import type { ServiceDependencies } from '../services.js';

export function requireAdmin(user: AuthContext): void {
  if (!isAdmin(user)) throw new CloudError(403, 'admin_required', 'Admin access is required');
}

export function isAdmin(user: AuthContext): boolean {
  return user.groups.includes('Admins');
}

export function isBaseUser(user: AuthContext): boolean {
  return user.groups.includes('Users') || isParticipant(user) || isMetaTester(user);
}

export function isParticipant(user: AuthContext): boolean {
  return isAdmin(user) || user.groups.includes('Participants');
}

function isReleaseOperator(user: AuthContext): boolean {
  return user.groups.includes('Operators');
}

function isMetaTester(user: AuthContext): boolean {
  return user.groups.includes('MetaTesters');
}

export function isConnectorTester(user: AuthContext): boolean {
  return isParticipant(user) && (isAdmin(user) || user.groups.includes('ConnectorTesters'));
}

export function requireParticipant(user: AuthContext): void {
  if (!isParticipant(user)) {
    throw new CloudError(
      403,
      'participant_access_required',
      'This research release is available to invited participants only',
    );
  }
}

export function requireReleaseRecipient(user: AuthContext): void {
  if (!isBaseUser(user) && !isReleaseOperator(user)) {
    throw new CloudError(
      403,
      'release_access_required',
      'This release is available to Sia users and approved release operators only',
    );
  }
}

export function requireMetaAccess(user: AuthContext): void {
  if (!isBaseUser(user)) {
    throw new CloudError(
      403,
      'user_access_required',
      'A Sia user account is required for hosted models',
    );
  }
}

export function requireBaseUser(user: AuthContext): void {
  if (!isBaseUser(user)) {
    throw new CloudError(403, 'user_access_required', 'A Sia user account is required');
  }
}

export function requireConnectorAccess(deps: ServiceDependencies, user: AuthContext): void {
  requireFeature(deps.config.features.connectors, 'connectors_disabled');
  requireParticipant(user);
  if (!isConnectorTester(user)) {
    throw new CloudError(
      403,
      'connector_tester_required',
      'Connected apps are limited to the acceptance-testing cohort',
    );
  }
}

export function requireFeature(enabled: boolean, code: string): void {
  if (!enabled) {
    throw new CloudError(503, code, 'This capability is temporarily disabled', true);
  }
}
