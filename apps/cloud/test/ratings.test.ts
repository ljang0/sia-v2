import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { AuthContext } from '../src/contracts.js';
import { CloudError } from '../src/domain.js';
import { FixedClock, MemoryAudit, MemoryIdentity, MemoryRatings } from '../src/memory.js';
import type { MetaConfig } from '../src/ports.js';
import { routeControlRequest } from '../src/router.js';
import { RATING_HOURLY_LIMIT, RatingsService } from '../src/services/ratings.js';
import type { ServiceDependencies } from '../src/services.js';

const user: AuthContext = { subject: 'user-1', email: 'user@example.com', groups: ['Users'] };
const other: AuthContext = { subject: 'user-2', email: 'other@example.com', groups: ['Users'] };
const admin: AuthContext = {
  subject: 'admin-1',
  email: 'admin@example.com',
  groups: ['Admins'],
};

function fixture(options: { mfa?: boolean } = {}) {
  const ratings = new MemoryRatings();
  const audit = new MemoryAudit();
  const identity = new MemoryIdentity();
  if (options.mfa === false) identity.hasMfa = async () => false;
  const meta = {
    catalogId: 'arena',
    displayName: 'Arena',
    additionalLabs: [{ catalogId: 'meta', displayName: 'Meta' }],
  } as unknown as MetaConfig;
  const deps = {
    clock: new FixedClock(new Date('2026-10-20T12:00:00.000Z')),
    ratings,
    audit,
    identity,
    secrets: { meta: async () => meta },
    config: { features: { hostedModels: true } },
  } as unknown as ServiceDependencies;
  return { ratings, audit, service: new RatingsService(deps) };
}

function rating(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    threadId: 'thread-1',
    turnId: 'turn-1',
    rating: 'good',
    reasons: ['fast'],
    route: {
      provider: 'meta',
      lab: { id: 'arena', name: 'Spoofed name' },
      model: 'llama-5',
      harnessId: 'codex_app_server',
    },
    task: {
      outcome: 'completed',
      durationMs: 30_000,
      stepCount: 4,
      usedComputer: true,
      usedBrowser: false,
      finishedAt: '2026-10-20T11:00:00.000Z',
    },
    appVersion: '0.1.0-alpha.28',
    createdAt: '2026-10-20T11:01:00.000Z',
    ...overrides,
  };
}

describe('task ratings', () => {
  it('stores a rating under its lab with no account id and rolls it up', async () => {
    const { ratings, service } = fixture();
    assert.deepEqual(await service.submit(user, rating()), { status: 'recorded' });
    const [stored] = [...ratings.ratings.values()];
    assert.ok(stored);
    assert.equal(stored.labId, 'arena');
    assert.equal(stored.day, '2026-10-20');
    // The cloud supplies the hosted lab's name, and drops thread and turn ids.
    assert.deepEqual(stored.record.route.lab, { id: 'arena', name: 'Arena' });
    const serialized = JSON.stringify(stored);
    assert.ok(!serialized.includes('user-1'));
    assert.ok(!serialized.includes('turn-1'));
    assert.ok(!serialized.includes('thread-1'));
    const [aggregate] = [...ratings.aggregates.values()];
    assert.deepEqual(aggregate?.counters, {
      ratings: 1,
      good: 1,
      outcome_completed: 1,
      durationMsTotal: 30_000,
      stepsTotal: 4,
      reason_fast: 1,
      usedComputer: 1,
    });
  });

  it('replaces an earlier rating of the same task and adjusts the counters', async () => {
    const { ratings, service } = fixture();
    await service.submit(user, rating());
    await service.submit(
      user,
      rating({ rating: 'bad', reasons: ['got_stuck'], comment: 'Stopped on the login page' }),
    );
    // Another person's rating of their own task with the same turn id stays separate.
    await service.submit(other, rating());
    assert.equal(ratings.ratings.size, 2);
    const [aggregate] = [...ratings.aggregates.values()];
    const counters = Object.fromEntries(
      Object.entries(aggregate!.counters).filter(([, value]) => value !== 0),
    );
    assert.deepEqual(counters, {
      ratings: 2,
      good: 1,
      bad: 1,
      outcome_completed: 2,
      durationMsTotal: 60_000,
      stepsTotal: 8,
      reason_fast: 1,
      reason_got_stuck: 1,
      comments: 1,
      usedComputer: 2,
    });
  });

  it('accepts only route and counters: content fields and unknown labs are refused', async () => {
    const { ratings, service } = fixture();
    for (const body of [
      rating({ prompt: 'Book my flight' }),
      rating({ reply: 'Booked.' }),
      rating({ task: { ...rating().task, screenshot: 'data:image/png;base64,AA' } }),
      rating({ comment: 'x'.repeat(501) }),
      rating({ reasons: ['got_stuck'] }),
      rating({ route: { ...rating().route, model: 'a#b' } }),
    ])
      await assert.rejects(service.submit(user, body), { code: 'invalid_rating' });
    await assert.rejects(
      service.submit(
        user,
        rating({ route: { ...rating().route, lab: { id: 'made-up', name: 'X' } } }),
      ),
      { code: 'unknown_lab' },
    );
    // A non-hosted provider files under its own id.
    await service.submit(
      user,
      rating({
        turnId: 'turn-2',
        route: {
          provider: 'codex',
          lab: { id: 'codex', name: 'Codex' },
          model: 'gpt-5.6-sol',
          harnessId: 'codex_app_server',
        },
      }),
    );
    await assert.rejects(
      service.submit(
        user,
        rating({ task: { ...rating().task, finishedAt: '2030-01-01T00:00:00.000Z' } }),
      ),
      { code: 'invalid_rating' },
    );
    assert.equal(ratings.ratings.size, 1);
  });

  it('needs a Sia account and rate-limits each account', async () => {
    const { service } = fixture();
    await assert.rejects(service.submit({ subject: 'x', groups: [] }, rating()), {
      code: 'user_access_required',
    });
    for (let index = 0; index < RATING_HOURLY_LIMIT; index += 1)
      await service.submit(user, rating({ turnId: `turn-${index}` }));
    await assert.rejects(service.submit(user, rating({ turnId: 'one-more' })), (error) => {
      assert.ok(error instanceof CloudError);
      assert.equal(error.status, 429);
      return true;
    });
    await service.submit(other, rating());
  });

  it('reports daily per-model, per-engine counts to admins without identifiers', async () => {
    const { service, audit } = fixture();
    await service.submit(user, rating());
    await service.submit(other, rating({ rating: 'bad', reasons: ['too_slow'] }));
    await service.submit(
      other,
      rating({ turnId: 'turn-9', route: { ...rating().route, harnessId: 'claude_code' } }),
    );
    await assert.rejects(service.report(user, { lab: 'arena' }), { code: 'admin_required' });
    const report = await service.report(admin, {
      lab: 'arena',
      from: '2026-10-01',
      to: '2026-10-20',
    });
    assert.equal(report.rows.length, 2);
    assert.deepEqual(report.rows[0], {
      day: '2026-10-20',
      lab: { id: 'arena', name: 'Arena' },
      provider: 'meta',
      model: 'llama-5',
      harnessId: 'claude_code',
      ratings: 1,
      good: 1,
      bad: 0,
      reasons: {
        did_it_right: 0,
        fast: 1,
        careful: 0,
        wrong_result: 0,
        got_stuck: 0,
        too_slow: 0,
        unsafe_or_asked_too_much: 0,
        did_not_finish: 0,
      },
      outcomes: { completed: 1, failed: 0, cancelled: 0 },
      comments: 0,
      usedComputer: 1,
      usedBrowser: 0,
      averageDurationMs: 30_000,
      averageSteps: 4,
    });
    assert.equal(report.rows[1]?.ratings, 2);
    assert.equal(report.rows[1]?.bad, 1);
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes('user-'));
    assert.ok(!serialized.includes('turn-'));
    assert.ok(
      audit.events.some(
        ({ action, outcome }) => action === 'ratings.report' && outcome === 'allowed',
      ),
    );
  });

  it('requires an authenticator for the admin report', async () => {
    const { service } = fixture({ mfa: false });
    await assert.rejects(service.report(admin, { lab: 'arena' }), { code: 'admin_required' });
  });
});

describe('rating routes', () => {
  it('requires sign-in and bounds the body size', async () => {
    let submitted: unknown;
    const services = {
      ratings: {
        submit: async (_user: AuthContext, body: unknown) => {
          submitted = body;
          return { status: 'recorded' };
        },
      },
    } as unknown as Parameters<typeof routeControlRequest>[1];
    const unauthenticated = await routeControlRequest(
      event('POST', '/v1/ratings', rating(), false),
      services,
    );
    assert.equal(unauthenticated.statusCode, 401);
    const large = await routeControlRequest(
      event('POST', '/v1/ratings', { ...rating(), comment: 'x'.repeat(5_000) }),
      services,
    );
    assert.equal(large.statusCode, 413);
    assert.equal(submitted, undefined);
    const accepted = await routeControlRequest(
      event('POST', '/v1/ratings', rating()),
      services,
    );
    assert.equal(accepted.statusCode, 201);
    assert.deepEqual(submitted, rating());
  });
});

function event(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  authenticated = true,
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    resource: path,
    requestContext: {
      requestId: 'request-1',
      identity: { sourceIp: '203.0.113.7' },
      ...(authenticated
        ? {
            authorizer: {
              claims: { sub: 'user-1', email: 'person@example.com', 'cognito:groups': 'Users' },
            },
          }
        : {}),
    },
  } as unknown as APIGatewayProxyEvent;
}
