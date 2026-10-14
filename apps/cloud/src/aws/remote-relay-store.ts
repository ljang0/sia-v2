import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { RemoteConnection, RemoteDevice, RemoteRelayStore } from '../ports.js';
import { userPk } from './shared.js';

const devicePk = (deviceId: string) => `REMOTE_DEVICE#${deviceId}`;
const connectionPk = (connectionId: string) => `REMOTE_CONN#${connectionId}`;
const nowSeconds = () => Math.floor(Date.now() / 1_000);

/**
 * Phone relay records in the shared control table:
 * - `REMOTE_DEVICE#<id>` / `DEVICE` — the device (owner and token hash).
 * - `USER#<sub>` / `REMOTE_DEVICE#<id>` — the owner's index of devices.
 * - `REMOTE_CONN#<id>` / `CONN` — one WebSocket connection (TTL).
 * - `REMOTE_DEVICE#<id>` / `CONN#<connectionId>` — a device's live connections (TTL).
 * - `USER#<sub>` / `REMOTE_MAC` — the account's current Mac connection.
 * - `REMOTE_CONN#<id>` / `FRAMES#<minute>` — per-connection frame counter (TTL).
 */
export class DynamoRemoteRelayStore implements RemoteRelayStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getDevice(deviceId: string): Promise<RemoteDevice | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: devicePk(deviceId), SK: 'DEVICE' },
        ConsistentRead: true,
      }),
    );
    return result.Item ? deviceFrom(result.Item) : undefined;
  }

  async listDevices(userId: string): Promise<RemoteDevice[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': userPk(userId), ':prefix': 'REMOTE_DEVICE#' },
        ConsistentRead: true,
      }),
    );
    const devices = await Promise.all(
      (result.Items ?? []).map((item) => this.getDevice(String(item.deviceId))),
    );
    return devices.filter((device): device is RemoteDevice => device?.userId === userId);
  }

  async createDevice(device: RemoteDevice): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: devicePk(device.deviceId), SK: 'DEVICE', Type: 'RemoteDevice', ...device },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: userPk(device.userId),
          SK: `REMOTE_DEVICE#${device.deviceId}`,
          Type: 'RemoteDeviceIndex',
          deviceId: device.deviceId,
        },
      }),
    );
  }

  async deleteDevice(userId: string, deviceId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: devicePk(deviceId), SK: 'DEVICE' },
        ConditionExpression: 'attribute_not_exists(PK) OR userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
      }),
    );
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `REMOTE_DEVICE#${deviceId}` },
      }),
    );
  }

  async touchDevice(deviceId: string, at: string): Promise<void> {
    await this.client
      .send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: devicePk(deviceId), SK: 'DEVICE' },
          UpdateExpression: 'SET lastSeenAt = :at',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':at': at },
        }),
      )
      .catch(() => undefined);
  }

  async putConnection(connection: RemoteConnection): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: connectionPk(connection.connectionId),
          SK: 'CONN',
          Type: 'RemoteConnection',
          ...connection,
        },
      }),
    );
    if (connection.role === 'phone' && connection.deviceId) {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: devicePk(connection.deviceId),
            SK: `CONN#${connection.connectionId}`,
            Type: 'RemoteDeviceConnection',
            connectionId: connection.connectionId,
            expiresAt: connection.expiresAt,
          },
        }),
      );
    }
  }

  async getConnection(connectionId: string): Promise<RemoteConnection | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: connectionPk(connectionId), SK: 'CONN' },
        ConsistentRead: true,
      }),
    );
    const item = result.Item;
    if (!item || Number(item.expiresAt) <= nowSeconds()) return undefined;
    return {
      connectionId: String(item.connectionId),
      role: item.role as RemoteConnection['role'],
      ...(typeof item.userId === 'string' ? { userId: item.userId } : {}),
      ...(typeof item.deviceId === 'string' ? { deviceId: item.deviceId } : {}),
      connectedAt: String(item.connectedAt),
      expiresAt: Number(item.expiresAt),
    };
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const connection = await this.getConnection(connectionId);
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: connectionPk(connectionId), SK: 'CONN' },
      }),
    );
    if (connection?.deviceId) {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: devicePk(connection.deviceId), SK: `CONN#${connectionId}` },
        }),
      );
    }
  }

  async deviceConnections(deviceId: string): Promise<string[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': devicePk(deviceId), ':prefix': 'CONN#' },
        ConsistentRead: true,
      }),
    );
    const now = nowSeconds();
    return (result.Items ?? [])
      .filter((item) => Number(item.expiresAt) > now)
      .map((item) => String(item.connectionId));
  }

  async macConnection(userId: string): Promise<string | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: 'REMOTE_MAC' },
        ConsistentRead: true,
      }),
    );
    return typeof result.Item?.connectionId === 'string' ? result.Item.connectionId : undefined;
  }

  async setMacConnection(userId: string, connectionId: string): Promise<string | undefined> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: 'REMOTE_MAC' },
        UpdateExpression: 'SET connectionId = :connectionId, #type = :type',
        ExpressionAttributeNames: { '#type': 'Type' },
        ExpressionAttributeValues: { ':connectionId': connectionId, ':type': 'RemoteMac' },
        ReturnValues: 'UPDATED_OLD',
      }),
    );
    return typeof result.Attributes?.connectionId === 'string'
      ? result.Attributes.connectionId
      : undefined;
  }

  async clearMacConnection(userId: string, connectionId: string): Promise<void> {
    await this.client
      .send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: 'REMOTE_MAC' },
          ConditionExpression: 'connectionId = :connectionId',
          ExpressionAttributeValues: { ':connectionId': connectionId },
        }),
      )
      .catch(() => undefined);
  }

  async countFrame(connectionId: string, minute: number): Promise<number> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: connectionPk(connectionId), SK: `FRAMES#${minute}` },
        UpdateExpression: 'ADD frames :one SET expiresAt = :ttl',
        ExpressionAttributeValues: { ':one': 1, ':ttl': (minute + 2) * 60 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(result.Attributes?.frames ?? 1);
  }

  async deleteUserDevices(userId: string): Promise<void> {
    for (const device of await this.listDevices(userId)) {
      await this.deleteDevice(userId, device.deviceId);
    }
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: 'REMOTE_MAC' },
      }),
    );
  }
}

function deviceFrom(item: Record<string, unknown>): RemoteDevice {
  return {
    deviceId: String(item.deviceId),
    userId: String(item.userId),
    tokenHash: String(item.tokenHash),
    createdAt: String(item.createdAt),
    ...(typeof item.lastSeenAt === 'string' ? { lastSeenAt: item.lastSeenAt } : {}),
  };
}
