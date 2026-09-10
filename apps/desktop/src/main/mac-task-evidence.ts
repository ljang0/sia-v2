import { randomUUID } from 'node:crypto';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { parseActionArguments } from '@sia/action-gateway';

type Observation = {
  text: string;
  visual: boolean;
  blocker: boolean;
  window?: { app_id: string; window_id: string; title?: string; browser_origin?: string };
};
const normalize = (value: string) =>
  value
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const key = (request: ValidatedActionInvocation) =>
  JSON.stringify([request.context.sessionId, request.context.threadId, request.context.turnId]);

// Numerical findings must come from the cited observation, not mental arithmetic
// or expectations. Commas in display values (3,374) do not change the number.
export function unsupportedNumericClaims(claim: string, source: string): string[] {
  const numbers = (text: string) =>
    text
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '')
      .match(/\d+(?:\.\d+)?/g) ?? [];
  const identifiers = (text: string) =>
    [...text.matchAll(/\b\d+(?:[-–]\d+)+\b/g)].map(([value]) => value.replace(/[-–]/g, ''));
  const supported = new Set([...numbers(source), ...identifiers(source)]);
  // Preserve exact digits when an identifier is merely formatted differently
  // (07128 and 07-128), without accepting a recalculated or rounded value.
  const normalizedClaim = claim.replace(/\b\d+(?:[-–]\d+)+\b/g, (value) => {
    const joined = value.replace(/[-–]/g, '');
    return supported.has(joined) ? joined : value;
  });
  return [...new Set(numbers(normalizedClaim))].filter((number) => !supported.has(number));
}

/** Bounded, in-memory citations; never persisted or reused across turns. */
export class MacTaskEvidence {
  readonly #turns = new Map<string, Map<string, Observation>>();

  recentWindows(request: ValidatedActionInvocation): Observation['window'][] {
    const windows = new Map<string, Observation['window']>();
    for (const observation of this.#turns.get(key(request))?.values() ?? []) {
      if (observation.window && !observation.blocker)
        windows.set(observation.window.window_id, observation.window);
    }
    return [...windows.values()].slice(-6);
  }

  observe(
    request: ValidatedActionInvocation,
    result: ActionExecutionResult,
  ): ActionExecutionResult {
    if (!['computer_snapshot', 'computer_action', 'mac_automation'].includes(request.name))
      return result;
    const data =
      result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : {};
    const blocker =
      !['verified', 'accepted_unverified'].includes(result.outcome) ||
      data.observation_pending === true ||
      data.loading === true;
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const text = blocker
      ? result.summary
      : request.name === 'mac_automation'
        ? JSON.stringify(data)
        : [
            data.visible_text,
            data.image_text,
            ...elements.flatMap((element: Record<string, unknown>) => [
              element.label,
              element.value,
            ]),
          ]
            .filter((value): value is string => typeof value === 'string')
            .join('\n');
    const visual = !blocker && Boolean(result.images?.length);
    if (!text && !visual) return result;
    const turn = key(request);
    let observations = this.#turns.get(turn);
    if (!observations) {
      observations = new Map();
      this.#turns.set(turn, observations);
      if (this.#turns.size > 8) this.#turns.delete(this.#turns.keys().next().value!);
    }
    const appId = data.app_id ?? request.arguments.app_id;
    const windowId = data.window_id ?? request.arguments.window_id;
    const window =
      typeof appId === 'string' && typeof windowId === 'string'
        ? {
            app_id: appId,
            window_id: windowId,
            ...(typeof data.title === 'string' ? { title: data.title } : {}),
            ...(typeof data.browser_origin === 'string'
              ? { browser_origin: data.browser_origin }
              : {}),
          }
        : undefined;
    const evidenceId = `evidence:${randomUUID()}`;
    observations.set(evidenceId, {
      text: normalize(text).slice(0, 80_000),
      visual,
      blocker,
      ...(window ? { window } : {}),
    });
    if (observations.size > 100) observations.delete(observations.keys().next().value!);
    return {
      ...result,
      data: {
        ...data,
        evidence_id: evidenceId,
        ...(blocker
          ? {
              evidence_kind: 'blocker',
              previously_observed_windows: this.recentWindows(request),
            }
          : {}),
      },
    };
  }

  complete(request: ValidatedActionInvocation): ActionExecutionResult {
    const { items } = parseActionArguments('computer_task_complete', request.arguments);
    const observations = this.#turns.get(key(request));
    for (const item of items) {
      const observation = observations?.get(item.evidence_id);
      if (
        !observation ||
        (item.status === 'verified' && observation.blocker) ||
        (item.status === 'verified' && item.kind === 'visual'
          ? !observation.visual
          : !normalize(item.quote) || !observation.text.includes(normalize(item.quote)))
      )
        return {
          outcome: 'refused',
          summary: `Evidence for “${item.requirement}” is missing, unfinished, from another turn, or does not contain the quoted text. Inspect the actual content again. Blockers also require an evidence_id and exact quote from a real observation or host refusal.`,
        };
      // Do not certify a calculated/remembered number just because a screenshot
      // exists. This caught the recorded 254 → 3,374 Calculator false positive.
      const finding = item.status === 'verified' ? item.finding : item.reason;
      const source =
        item.status === 'verified' && item.kind === 'visual' ? observation.text : item.quote;
      const unsupported = unsupportedNumericClaims(finding, source);
      if (unsupported.length)
        return {
          outcome: 'refused',
          summary: `The cited observation does not support these reported numbers: ${unsupported.join(', ')}. Read the actual displayed value. Use text evidence for numbers, dates, names and document facts; a screenshot's existence is not verification.`,
          data: { cited_text: observation.text.slice(0, 12000) },
        };
      if (
        item.status === 'blocked' &&
        observation.blocker &&
        !normalize(item.quote).includes(normalize(item.reason))
      )
        return {
          outcome: 'refused',
          summary:
            'Report the observed blocker verbatim as reason. Do not reinterpret an unidentified window as a login or permission problem. The blocker applies only to the cited window. Continue in a previously observed task window when available.',
          data: { previously_observed_windows: this.recentWindows(request) },
        };
    }
    const verified = items.filter((item) => item.status === 'verified').length;
    return {
      outcome: 'verified',
      summary: `Evidence checked for ${verified} of ${items.length} requirements; ${items.length - verified} blocked. Report only these findings and state every unresolved item. This checks citations and numerical claims, not semantic correctness or completeness.`,
      data: {
        items,
        task_status: verified === items.length ? 'verified' : verified ? 'partial' : 'blocked',
      },
    };
  }
}
