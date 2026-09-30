import type { AuthContext } from '../contracts.js';
import type { ServiceDependencies } from '../services.js';
import { isAdmin, isBaseUser, isConnectorTester, isParticipant } from './access.js';

export class SessionService {
  constructor(private readonly deps: ServiceDependencies) {}

  status(user: AuthContext) {
    const admin = isAdmin(user);
    const participant = isParticipant(user);
    const baseUser = isBaseUser(user);
    const connectors = this.deps.config.features.connectors && isConnectorTester(user);
    return {
      user: baseUser,
      admin,
      participant,
      account: {
        subject: user.subject,
        ...(user.email === undefined ? {} : { email: user.email }),
      },
      entitlements: {
        base: baseUser,
        hostedModels: this.deps.config.features.hostedModels && baseUser,
        hostedVoice: this.deps.config.features.hostedVoice && baseUser,
        research: participant,
        connectors,
      },
      features: {
        researchUploads: this.deps.config.features.researchUploads && participant,
        researchArchive: this.deps.config.features.researchArchive && admin,
        connectors,
        schedules: this.deps.config.features.schedules && baseUser,
      },
    };
  }
}
