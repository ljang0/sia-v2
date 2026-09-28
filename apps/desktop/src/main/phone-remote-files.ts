import { basename } from 'node:path';
import type { RemoteNote } from '../shared/phone-remote.js';
import { NativeSkills } from './native-skills.js';

/** The phone vault and native agent share one Notch-format skill registry. */
export async function nativeRemoteSkills(
  workspace: string,
  agentId: string,
): Promise<RemoteNote[]> {
  try {
    return new NativeSkills(workspace, agentId)
      .list()
      .slice(0, 60)
      .map((skill) => ({
        id: `native:${basename(skill.path!)}`,
        title: skill.title,
        kind: 'skill',
        content: `${skill.description}\n\n\`\`\`bash\n${skill.source}\n\`\`\``,
      }));
  } catch {
    // A missing or changing workspace must not hide the encrypted memory vault.
    return [];
  }
}
