import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ApiGatewayPusher } from './aws/api-gateway-pusher.js';
import { CognitoIdTokenVerifier } from './aws/cognito-id-token.js';
import { DynamoRemoteRelayStore } from './aws/remote-relay-store.js';
import { RemoteRelayService } from './services/remote-relay.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const services = new Map<string, RemoteRelayService>();
let shared: { store: DynamoRemoteRelayStore; idTokens: CognitoIdTokenVerifier } | undefined;

// Configuration is read on first use, like the other functions, so bundles load without it.
function dependencies() {
  return (shared ??= {
    store: new DynamoRemoteRelayStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      }),
      requiredEnv('TABLE_NAME'),
    ),
    idTokens: new CognitoIdTokenVerifier(
      requiredEnv('AWS_REGION'),
      requiredEnv('USER_POOL_ID'),
      requiredEnv('USER_POOL_CLIENT_ID'),
    ),
  });
}

/** The phone relay's WebSocket handler for $connect, $disconnect, and $default. */
export const handler = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const { domainName, stage, routeKey, connectionId } = event.requestContext;
  const endpoint = `https://${domainName}/${stage}`;
  let service = services.get(endpoint);
  if (!service) {
    service = new RemoteRelayService({
      ...dependencies(),
      pusher: ApiGatewayPusher.forEndpoint(endpoint),
      clock: { now: () => new Date() },
      ids: { next: () => crypto.randomUUID() },
    });
    services.set(endpoint, service);
  }
  try {
    await service.handle({ routeKey, connectionId, body: event.body });
  } catch (error) {
    console.error(
      '[sia:remote-relay]',
      routeKey,
      error instanceof Error ? error.name : 'error',
    );
    if (routeKey === '$connect') return { statusCode: 500 };
  }
  return { statusCode: 200 };
};
