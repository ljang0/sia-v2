import type {
  ProviderSession,
  ProviderTurnInput,
  ThreadEventEnvelope,
  ToolEvent,
} from '@sia/protocol';
import { AsyncQueue } from '../async-queue.js';
import { EventFactory, numberAt, record, stringAt } from '../events.js';

export interface ActiveTurn {
  readonly session: ProviderSession;
  readonly input: ProviderTurnInput;
  readonly queue: AsyncQueue<ThreadEventEnvelope>;
  readonly events: EventFactory;
  readonly nativeItems: Map<string, Record<string, unknown>>;
  readonly dynamicToolNames: ReadonlySet<string>;
  readonly mac: boolean;
  readonly nativeApproval: 'ask' | 'auto';
  /**
   * "Allow for this task" grants: Codex's acceptForSession semantics (the same command in the
   * same folder, or the same files), kept in Sia so they end with this turn, not the session.
   */
  readonly taskGrants: Set<string>;
  lastActivity?: number;
  approvalPending?: boolean;
  dynamicToolsPending?: number;
  watchdogError?: string;
  hasFinalResponse?: boolean;
  nativeTurnId?: string;
  /** Stop arrived before Codex reported the native turn id. */
  interruptPending?: boolean;
  /** Steers waiting for the native turn id, which turn/steer requires. */
  nativeTurnIdWaiters?: Array<(nativeTurnId: string | undefined) => void>;
}

/**
 * What an "Allow for this task" answer covers, or undefined when it cannot be offered. Like
 * Codex's acceptForSession: a command is matched exactly (with its folder) and a file change by
 * its paths. Requests for extra permissions, network access, terminal input, or a whole folder
 * always ask.
 */
export function nativeTaskGrantKeys(
  method: string,
  active: ActiveTurn,
  params: unknown,
): string[] | undefined {
  const value = record(params);
  if (method === 'item/commandExecution/requestApproval') {
    const command = stringAt(params, ['command']);
    if (
      !command ||
      (stringAt(params, ['kind']) ?? 'command') !== 'command' ||
      value.additionalPermissions ||
      value.networkApprovalContext
    )
      return undefined;
    return [`command\u0000${stringAt(params, ['cwd']) ?? ''}\u0000${command}`];
  }
  if (method === 'item/fileChange/requestApproval') {
    if (stringAt(params, ['grantRoot'])) return undefined;
    const itemId = stringAt(params, ['itemId']);
    const item = itemId ? active.nativeItems.get(itemId) : undefined;
    const paths = (Array.isArray(item?.changes) ? item.changes : []).flatMap((candidate) => {
      const path = stringAt(record(candidate), ['path']);
      return path ? [`file\u0000${path}`] : [];
    });
    return paths.length ? paths : undefined;
  }
  return undefined;
}

export function nativeApprovalDescription(active: ActiveTurn, params: unknown): string {
  const command = stringAt(params, ['command']);
  if (command) return `Run a command: ${command}`;
  const itemId = stringAt(params, ['itemId']);
  const item = itemId ? active.nativeItems.get(itemId) : undefined;
  const paths = (Array.isArray(item?.changes) ? item.changes : []).flatMap((candidate) => {
    const path = stringAt(record(candidate), ['path']);
    return path ? [path] : [];
  });
  const grantRoot = stringAt(params, ['grantRoot']);
  const reason = stringAt(params, ['reason']);
  if (paths.length === 1) return `Change ${paths[0]}`;
  if (paths.length > 1) {
    const shown = paths.slice(0, 3).join(', ');
    const more = paths.length > 3 ? ` and ${paths.length - 3} more` : '';
    return `Change ${paths.length} files: ${shown}${more}`;
  }
  if (grantRoot) return `Allow changes in ${grantRoot}`;
  return reason ?? 'Allow this native file change?';
}

export function nativeToolEvent(
  active: ActiveTurn,
  itemId: string,
  item: Record<string, unknown>,
  phase: ToolEvent['payload']['phase'],
): ToolEvent {
  const itemType = stringAt(item, ['type']);
  const name = stringAt(item, ['tool'], ['name']) ?? itemType ?? 'provider_tool';
  const presentation = nativePresentation(itemType, item);
  return active.events.create('tool', {
    callId: itemId,
    name,
    phase,
    arguments: record(item.arguments ?? item.input),
    ...(item.output === undefined ? {} : { result: item.output }),
    ...(presentation ? { presentation } : {}),
    native: !active.dynamicToolNames.has(name),
  });
}

export function nativePhase(
  method: string,
  item: Readonly<Record<string, unknown>>,
): ToolEvent['payload']['phase'] {
  const status = stringAt(item, ['status']);
  if (status === 'failed' || status === 'declined') return 'failed';
  if (
    method === 'item/completed' &&
    item.type === 'commandExecution' &&
    typeof item.exitCode === 'number' &&
    item.exitCode !== 0
  )
    return 'failed';
  return method === 'item/started' ? 'started' : 'completed';
}

function nativePresentation(
  itemType: string | undefined,
  item: Readonly<Record<string, unknown>>,
): ToolEvent['payload']['presentation'] | undefined {
  if (itemType === 'commandExecution') {
    return {
      kind: 'command',
      command: stringAt(item, ['command']) ?? 'Command',
      ...(stringAt(item, ['cwd']) ? { cwd: stringAt(item, ['cwd']) } : {}),
      ...(stringAt(item, ['aggregatedOutput'])
        ? { output: stringAt(item, ['aggregatedOutput'])?.slice(-64_000) }
        : {}),
      ...(item.exitCode === null || numberAt(item, ['exitCode']) !== undefined
        ? { exitCode: item.exitCode === null ? null : numberAt(item, ['exitCode']) }
        : {}),
      ...(item.durationMs === null || numberAt(item, ['durationMs']) !== undefined
        ? { durationMs: item.durationMs === null ? null : numberAt(item, ['durationMs']) }
        : {}),
      ...(item.processId === null || stringAt(item, ['processId'])
        ? { processId: item.processId === null ? null : stringAt(item, ['processId']) }
        : {}),
    };
  }
  if (itemType === 'fileChange') {
    return {
      kind: 'file_change',
      files: (Array.isArray(item.changes) ? item.changes : []).flatMap((candidate) => {
        const change = record(candidate);
        const path = stringAt(change, ['path']);
        const kind = fileChangeKind(change.kind);
        if (!path || !kind) return [];
        const diff = stringAt(change, ['diff']);
        return [
          {
            path,
            change: kind.change,
            ...(kind.movePath ? { movePath: kind.movePath } : {}),
            ...(diff ? { diff } : {}),
          },
        ];
      }),
    };
  }
  if (itemType === 'webSearch') {
    return {
      kind: 'web_search',
      ...(stringAt(item, ['query']) ? { query: stringAt(item, ['query']) } : {}),
      sources: (Array.isArray(item.results) ? item.results : []).flatMap((candidate) => {
        const source = record(candidate);
        const url = stringAt(source, ['url'], ['link']);
        if (!url || !/^https?:\/\//i.test(url)) return [];
        const title = stringAt(source, ['title'], ['name']);
        return [{ url, ...(title ? { title } : {}) }];
      }),
    };
  }
  if (itemType === 'imageView' && stringAt(item, ['path'])) {
    return { kind: 'image', path: stringAt(item, ['path'])! };
  }
  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode') {
    return {
      kind: 'review',
      phase: itemType === 'enteredReviewMode' ? 'entered' : 'exited',
      review: stringAt(item, ['review']) ?? 'Code review',
    };
  }
  if (itemType === 'contextCompaction') return { kind: 'compaction' };
  return undefined;
}

/**
 * App Server sends `PatchChangeKind` as `{ type: 'add' | 'delete' | 'update', move_path }`;
 * older builds and fixtures sent a bare string. An update with a move path is a rename.
 */
function fileChangeKind(value: unknown): { change: string; movePath?: string } | undefined {
  if (typeof value === 'string') return value.trim() ? { change: value.trim() } : undefined;
  const kind = record(value);
  const type = stringAt(kind, ['type']);
  if (!type) return undefined;
  const movePath = stringAt(kind, ['move_path'], ['movePath']);
  if (type === 'update' && movePath) return { change: 'rename', movePath };
  return { change: type };
}

export function codexSubagentEvents(
  active: ActiveTurn,
  itemId: string,
  item: Readonly<Record<string, unknown>>,
  method: string,
) {
  const itemType = stringAt(item, ['type']);
  if (itemType === 'subAgentActivity') {
    const subagentId = stringAt(item, ['agentThreadId']) ?? itemId;
    const kind = stringAt(item, ['kind']);
    const agentPath = stringAt(item, ['agentPath']);
    return [
      active.events.create('subagent', {
        subagentId,
        name: subagentName(agentPath, subagentId),
        phase:
          kind === 'interrupted' ? 'failed' : kind === 'interacted' ? 'message' : 'started',
        operation: 'activity',
        parentThreadId: active.session.nativeId,
        ...(agentPath ? { agentPath } : {}),
      }),
    ];
  }

  const tool = stringAt(item, ['tool']);
  const operation = collabOperation(tool);
  const states = record(item.agentsStates);
  const receiverIds = Array.isArray(item.receiverThreadIds)
    ? item.receiverThreadIds.filter((value): value is string => typeof value === 'string')
    : [];
  const targets = [...new Set([...receiverIds, ...Object.keys(states)])];
  if (!targets.length) targets.push(itemId);
  return targets.map((subagentId) => {
    const state = record(states[subagentId]);
    const status = stringAt(state, ['status']);
    const text = stringAt(state, ['message']) ?? stringAt(item, ['prompt']);
    const model = stringAt(item, ['model']);
    const reasoningEffort = stringAt(item, ['reasoningEffort']);
    return active.events.create('subagent', {
      subagentId,
      name: subagentName(undefined, subagentId),
      phase: subagentPhase(operation, status, method, stringAt(item, ['status'])),
      operation,
      parentThreadId: stringAt(item, ['senderThreadId']) ?? active.session.nativeId,
      ...(text ? { text } : {}),
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });
  });
}

function collabOperation(tool: string | undefined) {
  if (tool === 'spawnAgent') return 'spawn' as const;
  if (tool === 'sendInput') return 'send' as const;
  if (tool === 'resumeAgent') return 'resume' as const;
  if (tool === 'closeAgent') return 'close' as const;
  return 'wait' as const;
}

function subagentPhase(
  operation: ReturnType<typeof collabOperation>,
  agentStatus: string | undefined,
  _method: string,
  callStatus: string | undefined,
) {
  if (agentStatus === 'errored' || callStatus === 'failed') return 'failed' as const;
  if (agentStatus === 'completed' || agentStatus === 'shutdown' || operation === 'close') {
    return 'completed' as const;
  }
  if (operation === 'send' || operation === 'wait') return 'message' as const;
  return 'started' as const;
}

function subagentName(agentPath: string | undefined, subagentId: string): string {
  const leaf = agentPath?.split('/').filter(Boolean).at(-1);
  return leaf || `Agent ${subagentId.slice(0, 8)}`;
}

export function isTextOnlyCodexItem(itemType: string | undefined): boolean {
  if (!itemType) return false;
  const normalized = itemType.replace(/[^a-z]/gi, '').toLowerCase();
  return (
    normalized === 'agentmessage' || normalized === 'usermessage' || normalized === 'reasoning'
  );
}
