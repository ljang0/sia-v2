import { randomUUID } from 'node:crypto';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { parseActionArguments } from '@sia/action-gateway';

type Observation = { text: string; visual: boolean };
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const key = (request: ValidatedActionInvocation) =>
  JSON.stringify([request.context.sessionId, request.context.threadId, request.context.turnId]);

/** Bounded, in-memory citations; never persisted or reused across turns. */
export class MacTaskEvidence {
  readonly #turns = new Map<string, Map<string, Observation>>();

  observe(
    request: ValidatedActionInvocation,
    result: ActionExecutionResult,
  ): ActionExecutionResult {
    if (!['computer_snapshot', 'computer_action', 'mac_automation'].includes(request.name))
      return result;
    if (!['verified', 'accepted_unverified'].includes(result.outcome)) return result;
    const data =
      result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : {};
    if (data.observation_pending === true || data.loading === true) return result;
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const text =
      request.name === 'mac_automation'
        ? JSON.stringify(data)
        : elements
            .flatMap((element: Record<string, unknown>) =>
              [element.label, element.value].filter(
                (value): value is string => typeof value === 'string',
              ),
            )
            .join('\n');
    const visual = Boolean(result.images?.length);
    if (!text && !visual) return result;
    const turn = key(request);
    let observations = this.#turns.get(turn);
    if (!observations) {
      observations = new Map();
      this.#turns.set(turn, observations);
      if (this.#turns.size > 8) this.#turns.delete(this.#turns.keys().next().value!);
    }
    const evidenceId = `evidence:${randomUUID()}`;
    observations.set(evidenceId, { text: normalize(text).slice(0, 80_000), visual });
    if (observations.size > 100) observations.delete(observations.keys().next().value!);
    return { ...result, data: { ...data, evidence_id: evidenceId } };
  }

  complete(request: ValidatedActionInvocation): ActionExecutionResult {
    const { items } = parseActionArguments('computer_task_complete', request.arguments);
    const observations = this.#turns.get(key(request));
    for (const item of items) {
      if (item.status === 'blocked') continue;
      const observation = observations?.get(item.evidence_id);
      if (
        !observation ||
        (item.kind === 'visual'
          ? !observation.visual
          : !normalize(item.quote) || !observation.text.includes(normalize(item.quote)))
      )
        return {
          outcome: 'refused',
          summary: `Evidence for “${item.requirement}” is missing, belongs to another turn, or does not contain the quoted text. Inspect the actual content again or report the requirement as blocked.`,
        };
    }
    const verified = items.filter((item) => item.status === 'verified').length;
    return {
      outcome: 'verified',
      summary: `Evidence checked for ${verified} of ${items.length} requirements; ${items.length - verified} blocked. Report only these findings and state every unresolved item. This validates citations, not semantic correctness or completeness of the requirement list.`,
      data: {
        items,
        task_status: verified === items.length ? 'verified' : verified ? 'partial' : 'blocked',
      },
    };
  }
}
