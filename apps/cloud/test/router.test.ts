import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { APIGatewayProxyEvent } from 'aws-lambda';

import { routeControlRequest } from '../src/router.js';

describe('cloud control-plane routes', () => {
  it('accepts public base-account registration without a research flag', async () => {
    let registration:
      | {
          request: { email: string; researchEnrollmentAcknowledged?: boolean };
          sourceIp: string;
        }
      | undefined;
    const services = {
      registration: {
        create: async (
          request: { email: string; researchEnrollmentAcknowledged?: boolean },
          sourceIp: string,
        ) => {
          registration = { request, sourceIp };
          return { accepted: true as const };
        },
      },
    } as unknown as Parameters<typeof routeControlRequest>[1];

    const response = await routeControlRequest(
      event('POST', '/v1/auth/register', { email: 'person@example.com' }, false),
      services,
    );

    assert.equal(response.statusCode, 202);
    assert.deepEqual(JSON.parse(response.body), { accepted: true });
    assert.deepEqual(registration, {
      request: { email: 'person@example.com' },
      sourceIp: '203.0.113.7',
    });
  });

  it('routes the sanitized catalog, usage, and voice token contracts', async () => {
    const calls: string[] = [];
    const services = {
      hostedModels: {
        catalog: async () => {
          calls.push('catalog');
          return { schemaVersion: 1, providers: [] };
        },
        usage: async () => {
          calls.push('usage');
          return { schemaVersion: 1, providers: [] };
        },
      },
      voice: {
        catalog: async () => {
          calls.push('voice.catalog');
          return { schemaVersion: 1, provider: { id: 'elevenlabs', voices: [] } };
        },
        mintToken: async (_user: unknown, request: { type: string }) => {
          calls.push(`voice.tokens:${request.type}`);
          return {
            token: 'sutkn_temporary_value',
            type: request.type,
            expiresAt: '2026-08-26T00:15:00.000Z',
            singleUse: true,
          };
        },
      },
    } as unknown as Parameters<typeof routeControlRequest>[1];

    assert.equal(
      (await routeControlRequest(event('GET', '/v1/catalog'), services)).statusCode,
      200,
    );
    assert.equal(
      (await routeControlRequest(event('GET', '/v1/usage'), services)).statusCode,
      200,
    );
    assert.equal(
      (await routeControlRequest(event('GET', '/v1/voice/catalog'), services)).statusCode,
      200,
    );
    assert.equal(
      (
        await routeControlRequest(
          event('POST', '/v1/voice/tokens', { type: 'realtime_scribe' }),
          services,
        )
      ).statusCode,
      201,
    );
    assert.deepEqual(calls, [
      'catalog',
      'usage',
      'voice.catalog',
      'voice.tokens:realtime_scribe',
    ]);
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
              claims: {
                sub: 'user-1',
                email: 'person@example.com',
                'cognito:groups': 'Users',
              },
            },
          }
        : {}),
    },
  } as unknown as APIGatewayProxyEvent;
}
