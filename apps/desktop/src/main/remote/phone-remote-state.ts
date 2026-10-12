import { basename, dirname, resolve } from 'node:path';
import type { DesktopSnapshot } from '../../shared/bridge.js';
import type { AssistantLibraryView } from '../../shared/assistant-library.js';
import type {
  RemoteNote,
  RemoteState,
  RemoteTurn,
  RemoteVault,
} from '../../shared/phone-remote.js';
import { activityLabel } from '../../shared/activity-label.js';

/** Notch's remote snapshot, projected from Sia's canonical timeline, never its full IPC state. */
export function remoteState(
  snapshot: DesktopSnapshot,
  agentId: string,
  outbox: string,
  ignoredThread?: string,
): RemoteState {
  const agent = snapshot.agents.find((entry) => entry.id === agentId);
  const thread = snapshot.threads.find(
    (entry) =>
      entry.id === snapshot.activeThreadId &&
      entry.agentId === agentId &&
      !entry.archivedAt &&
      entry.id !== ignoredThread,
  );
  const result: RemoteState = {
    agent: agent?.name ?? 'Sia',
    mode: snapshot.computer.accessMode ?? 'connected',
    // Phone turns always confirm actions on the Mac; see DesktopController#trustForTurn.
    approval: 'ask',
    session: null,
    turns: [],
    workers: snapshot.threads.filter(
      (entry) => entry.agentId === agentId && ['running', 'queued'].includes(entry.status),
    ).length,
  };
  if (!thread) return result;
  // Queued follow-ups have not been sent yet; they join the transcript when they start.
  const items = snapshot.timeline.filter(
    (entry) =>
      entry.threadId === thread.id && !(entry.kind === 'user' && entry.status === 'pending'),
  );
  const users = items.filter((entry) => entry.kind === 'user').slice(-12);
  result.turns = users.map((user, index) => {
    const next = users[index + 1];
    const current = items.filter(
      (entry) => entry.sequence > user.sequence && (!next || entry.sequence < next.sequence),
    );
    const last = index === users.length - 1;
    const resumed = current.findLastIndex(
      (entry) => entry.kind === 'notice' && entry.title === 'Continuing task',
    );
    const attempt = resumed < 0 ? current : current.slice(resumed + 1);
    const responseParts = new Set(
      attempt
        .filter((entry) => entry.kind === 'assistant' || entry.kind === 'question')
        .map((entry) => (entry.text ?? '').trim())
        .filter(Boolean),
    );
    let response = [...responseParts].join('\n\n').slice(-24000);
    const resultFiles = attempt
      .filter((entry) => entry.kind === 'assistant')
      .flatMap((entry) => entry.attachments ?? [])
      .filter((file) => file.generated);
    const fileIds = Object.fromEntries(resultFiles.map((file) => [file.name, file.id]));
    const files: string[] = Object.keys(fileIds);
    response = response.replace(/\[Open result\]\(<([^>]+)>\)/g, (_match, path: string) => {
      const decoded = path.replaceAll('%3C', '<').replaceAll('%3E', '>');
      if (dirname(resolve(decoded)) === resolve(outbox)) files.push(basename(decoded));
      return '';
    });
    const cancelled = attempt.some(
      (entry) =>
        entry.kind === 'notice' &&
        /cancelled/i.test(`${entry.title ?? ''} ${entry.text ?? ''}`),
    );
    const errors = attempt
      .filter((entry) => entry.kind === 'error')
      .map((entry) => (entry.text ?? entry.title ?? '').trim());
    const error = [...new Set(errors)]
      .filter((text) => !responseParts.has(text))
      .join('\n')
      .slice(0, 2000);
    const status: RemoteTurn['status'] =
      last && ['running', 'queued'].includes(thread.status)
        ? 'working'
        : last && thread.status === 'waiting'
          ? 'waiting'
          : cancelled
            ? 'cancelled'
            : errors.length || (last && thread.status === 'failed')
              ? 'error'
              : 'done';
    const approval =
      status === 'waiting'
        ? snapshot.approvals?.find(
            (entry) => entry.threadId === thread.id && entry.status === 'pending',
          )?.title
        : undefined;
    return {
      ...(approval ? { approval: approval.slice(0, 200) } : {}),
      id: user.id,
      text: (user.text ?? '').slice(0, 8000),
      response: response.trim(),
      status,
      error,
      files: [...new Set(files)],
      ...(resultFiles.length ? { fileIds } : {}),
      steps: current
        .filter((entry) => entry.kind === 'activity')
        .slice(-16)
        .map((entry) => activityLabel(entry.toolName, entry.activity?.kind)),
    };
  });
  const latest = users.at(-1);
  if (latest) result.session = `${thread.id}:${latest.id}`;
  return result;
}

/** Notch's wikilink graph, including the canonical native vault when present. */
export function remoteVault(
  library: AssistantLibraryView,
  agentId: string,
  nativeSkills: RemoteNote[] = [],
): { graph: RemoteVault; notes: RemoteNote[] } {
  const notes: RemoteNote[] = [
    ...nativeSkills,
    ...(library.vaults?.find((vault) => vault.agentId === agentId)?.notes ?? [])
      .filter((note) => !note.name.startsWith('skills/'))
      .map((note) => ({
        id: `vault:${note.name}`,
        title: note.name.replace(/\.(md|log)$/, ''),
        kind: note.name === 'journal.md' ? ('journal' as const) : ('memory' as const),
        content: note.text,
      })),
    ...library.memories
      .filter((entry) => entry.agentId === agentId)
      .slice(-120)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: 'memory' as const,
        content: entry.text,
      })),
    ...(library.skills ?? [])
      .filter((entry) => entry.agentId === agentId && entry.execution !== 'native')
      .slice(-60)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: 'skill' as const,
        content: `${entry.description}\n\n${entry.source}`,
      })),
    ...library.workflows
      .filter((entry) => entry.agentId === agentId)
      .slice(-40)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: 'workflow' as const,
        content: entry.steps
          .map((step, index) => `${index + 1}. ${step.instruction}\nExpected: ${step.expected}`)
          .join('\n\n'),
      })),
  ];
  const journal = (library.journal ?? [])
    .filter((entry) => entry.agentId === agentId)
    .slice(-80);
  if (journal.length && !notes.some((note) => note.id === 'vault:journal.md'))
    notes.push({
      id: 'journal',
      title: 'Journal',
      kind: 'journal',
      content: journal
        .map((entry) => `${entry.timestamp}\n${entry.title}\n${entry.text}`)
        .join('\n\n')
        .slice(-60000),
    });
  const edges: [string, string][] = [];
  const topics = new Map<string, RemoteNote>();
  for (const note of notes) {
    for (const match of note.content.matchAll(/\[\[([^\]|]{1,64})(?:\|[^\]]*)?\]\]/g)) {
      const title = match[1]!.trim();
      if (!title || topics.size >= 100) continue;
      const target = notes.find((entry) => entry.title.toLowerCase() === title.toLowerCase());
      const id = target?.id ?? `topic:${title.toLowerCase()}`;
      if (!target && !topics.has(id))
        topics.set(id, { id, title, kind: 'topic', content: `Mentioned in ${note.title}.` });
      if (id !== note.id && !edges.some((edge) => edge.includes(id) && edge.includes(note.id)))
        edges.push([note.id, id]);
    }
  }
  notes.push(...topics.values());
  return {
    graph: { nodes: notes.map(({ id, title, kind }) => ({ id, title, kind })), edges },
    notes,
  };
}
