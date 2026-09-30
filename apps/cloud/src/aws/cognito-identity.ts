import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CloudError } from '../domain.js';
import type { IdentityProvider } from '../ports.js';

export class CognitoIdentity implements IdentityProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}
  async createPasswordlessUser(
    email: string,
    options: { suppressMessage?: boolean } = {},
  ): Promise<{ subject: string }> {
    let result;
    try {
      result = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          DesiredDeliveryMediums: ['EMAIL'],
          ...(options.suppressMessage ? { MessageAction: 'SUPPRESS' as const } : {}),
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'UsernameExistsException') throw error;
      const existing = await this.client.send(
        new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
      );
      const subject = existing.UserAttributes?.find(
        (attribute) => attribute.Name === 'sub',
      )?.Value;
      if (!subject) {
        throw new CloudError(
          502,
          'identity_create_failed',
          'The account could not be prepared',
        );
      }
      return { subject };
    }
    const subject = result.User?.Attributes?.find(
      (attribute) => attribute.Name === 'sub',
    )?.Value;
    if (!subject)
      throw new CloudError(
        502,
        'identity_create_failed',
        'The invite could not be created',
        true,
      );
    return { subject };
  }
  async addUserToGroup(
    email: string,
    group: 'Users' | 'Participants' | 'ConnectorTesters',
  ): Promise<void> {
    await this.client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: group,
      }),
    );
  }
  async deleteUser(subject: string): Promise<void> {
    const result = await this.client.send(
      new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `sub = "${subject.replaceAll('"', '')}"`,
        Limit: 1,
      }),
    );
    const username = result.Users?.[0]?.Username;
    if (!username) return;
    await this.client.send(
      new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username }),
    );
  }
  async hasMfa(email: string): Promise<boolean> {
    const user = await this.client.send(
      new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
    return (user.UserMFASettingList ?? []).includes('SOFTWARE_TOKEN_MFA');
  }
}
