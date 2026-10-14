import type { MetaStreamEvent } from './contracts.js';
import { CloudError, isRecord } from './domain.js';

export interface CollectedTurn {
  model: string;
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  usage: Record<string, unknown> | undefined;
  finishReason: string | undefined;
}

/** Drains Sia's stream into one response for clients that do not request streaming. */
export async function collectTurn(
  events: AsyncIterable<MetaStreamEvent>,
): Promise<CollectedTurn> {
  const turn: CollectedTurn = {
    model: '',
    text: '',
    toolCalls: [],
    usage: undefined,
    finishReason: undefined,
  };
  const calls = new Map<number, CollectedTurn['toolCalls'][number]>();
  for await (const event of events) {
    if (event.type === 'started') turn.model = event.model;
    else if (event.type === 'delta') turn.text += event.text;
    else if (event.type === 'usage') turn.usage = event.usage;
    else if (event.type === 'done') turn.finishReason = event.finishReason;
    else if (event.type === 'error') throw new CloudError(502, event.code, event.message, true);
    else if (event.type === 'tool_call_delta') {
      for (const delta of toolCallDeltas(event.delta)) {
        const call = calls.get(delta.index) ?? { id: '', name: '', arguments: '' };
        if (delta.id) call.id = delta.id;
        if (delta.name) call.name = delta.name;
        call.arguments += delta.arguments;
        calls.set(delta.index, call);
      }
    }
  }
  turn.toolCalls = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, c]) => c);
  return turn;
}

/** Normalizes OpenAI-style tool-call deltas, the shape every upstream reader emits. */
export function toolCallDeltas(
  value: unknown,
): Array<{ index: number; id: string; name: string; arguments: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, fallbackIndex) => {
    if (!isRecord(entry)) return [];
    const fn = isRecord(entry.function) ? entry.function : {};
    return [
      {
        index:
          typeof entry.index === 'number' && Number.isSafeInteger(entry.index)
            ? entry.index
            : fallbackIndex,
        id: typeof entry.id === 'string' ? entry.id : '',
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: typeof fn.arguments === 'string' ? fn.arguments : '',
      },
    ];
  });
}
