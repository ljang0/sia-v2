import { createHmac } from 'node:crypto';
import type { AuthContext, InviteRequest, RegistrationRequest } from '../contracts.js';
import { CloudError, requireString } from '../domain.js';
import type { ServiceDependencies } from '../services.js';
import { requireAdmin } from './access.js';

export class InvitesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async create(user: AuthContext, request: InviteRequest) {
    requireAdmin(user);
    const email = normalizeEmail(request.email);
    const existing = await this.deps.invites.getInvite(email);
    if (existing) {
      await this.deps.identity.addUserToGroup(email, 'Users');
      await this.deps.identity.addUserToGroup(email, 'Participants');
      return existing;
    }
    if ((await this.deps.invites.countInvites()) >= this.deps.config.inviteLimit) {
      throw new CloudError(
        409,
        'invite_limit_reached',
        'The alpha invite limit has been reached',
      );
    }
    const created = await this.deps.identity.createPasswordlessUser(email);
    await this.deps.identity.addUserToGroup(email, 'Users');
    await this.deps.identity.addUserToGroup(email, 'Participants');
    const record = {
      email,
      invitedBy: user.subject,
      invitedAt: this.deps.clock.now().toISOString(),
      subject: created.subject,
      status: 'invited' as const,
    };
    await this.deps.invites.putInvite(record);
    return record;
  }

  async list(user: AuthContext) {
    requireAdmin(user);
    return {
      invites: await this.deps.invites.listInvites(),
      limit: this.deps.config.inviteLimit,
    };
  }
}

const REGISTRATION_EMAIL_WINDOW_SECONDS = 15 * 60;

const REGISTRATION_NETWORK_WINDOW_SECONDS = 60 * 60;

const REGISTRATION_EMAIL_LIMIT = 4;

const REGISTRATION_NETWORK_LIMIT = 20;

/** Public, enumeration-resistant account bootstrap for passwordless Sia accounts. */
export class RegistrationService {
  constructor(private readonly deps: ServiceDependencies) {}

  async create(request: RegistrationRequest, sourceIp: string) {
    const email = normalizeEmail(request.email);
    const salt = await this.deps.secrets.registrationSalt();
    const now = Math.floor(this.deps.clock.now().getTime() / 1_000);
    const emailFingerprint = registrationFingerprint(salt, `email:${email}`);
    const networkFingerprint = registrationFingerprint(salt, `network:${sourceIp}`);
    const [emailAllowed, networkAllowed] = await Promise.all([
      this.deps.registrationLimits.consumeRegistrationLimit(
        'email',
        emailFingerprint,
        fixedWindowStart(now, REGISTRATION_EMAIL_WINDOW_SECONDS),
        now + REGISTRATION_EMAIL_WINDOW_SECONDS * 2,
        REGISTRATION_EMAIL_LIMIT,
      ),
      this.deps.registrationLimits.consumeRegistrationLimit(
        'network',
        networkFingerprint,
        fixedWindowStart(now, REGISTRATION_NETWORK_WINDOW_SECONDS),
        now + REGISTRATION_NETWORK_WINDOW_SECONDS * 2,
        REGISTRATION_NETWORK_LIMIT,
      ),
    ]);
    if (!emailAllowed || !networkAllowed) {
      throw new CloudError(
        429,
        'registration_rate_limited',
        'Too many account requests. Wait a little while and try again',
        true,
      );
    }

    const existing = await this.deps.invites.getInvite(email);
    // Account creation is public and independent of the research cohort. Suppress Cognito's
    // welcome message because the desktop immediately starts EMAIL_OTP after this returns.
    const created = await this.deps.identity.createPasswordlessUser(email, {
      suppressMessage: true,
    });
    await this.deps.identity.addUserToGroup(email, 'Users');

    // Named research invitations retain their existing behavior, but are now an additive
    // entitlement rather than a prerequisite for creating the base account.
    if (existing && existing.status !== 'failed') {
      await this.deps.identity.addUserToGroup(email, 'Participants');
    }
    if (
      existing &&
      existing.status !== 'failed' &&
      (existing.subject !== created.subject || existing.status !== 'active')
    ) {
      await this.deps.invites.putInvite({
        ...existing,
        subject: created.subject,
        status: 'active',
      });
    }
    // New and existing addresses deliberately receive the same response.
    return { accepted: true as const };
  }
}

function fixedWindowStart(now: number, seconds: number): number {
  return Math.floor(now / seconds) * seconds;
}

function registrationFingerprint(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value).digest('hex');
}

function normalizeEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CloudError(400, 'invalid_email', 'Enter a valid email address');
  }
  return email;
}
