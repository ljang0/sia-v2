import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ConnectionPusher } from '../ports.js';

/** Sends frames to API Gateway WebSocket connections. */
export class ApiGatewayPusher implements ConnectionPusher {
  constructor(private readonly client: ApiGatewayManagementApiClient) {}

  static forEndpoint(endpoint: string): ApiGatewayPusher {
    return new ApiGatewayPusher(new ApiGatewayManagementApiClient({ endpoint }));
  }

  async send(connectionId: string, frame: Record<string, unknown>): Promise<boolean> {
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(frame)),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof GoneException) return false;
      throw error;
    }
  }

  async close(connectionId: string): Promise<void> {
    try {
      await this.client.send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
    } catch (error) {
      if (!(error instanceof GoneException)) throw error;
    }
  }
}
