import { constants } from 'node:fs';
import { open, opendir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemoteNote } from '../shared/phone-remote.js';

/** Notch's # skill / # description script library, restricted to the selected Sia workspace. */
export async function nativeRemoteSkills(workspace: string): Promise<RemoteNote[]> {
  const notes: RemoteNote[] = [];
  try {
    const root = join(await realpath(workspace), '.sia-mac', 'skills');
    if ((await realpath(root)) !== root) return notes;
    const entries = await opendir(root);
    for await (const entry of entries) {
      if (notes.length >= 60) break;
      if (!entry.isFile() || !/^[a-z0-9][a-z0-9-]{0,100}\.sh$/.test(entry.name)) continue;
      const file = await open(
        join(root, entry.name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 16000) continue;
        const buffer = Buffer.alloc(stat.size);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        const source = buffer.subarray(0, bytesRead).toString('utf8');
        const title =
          source
            .match(/^# skill:\s*(.+)$/m)?.[1]
            ?.trim()
            .slice(0, 100) ?? entry.name.slice(0, -3);
        const description =
          source
            .match(/^# description:\s*(.+)$/m)?.[1]
            ?.trim()
            .slice(0, 500) ?? '';
        notes.push({
          id: `native:${entry.name}`,
          title,
          kind: 'skill',
          content: `${description}\n\n\`\`\`bash\n${source}\n\`\`\``,
        });
      } finally {
        await file.close();
      }
    }
  } catch {
    /* Missing or changing workspace: encrypted library remains available. */
  }
  return notes;
}
