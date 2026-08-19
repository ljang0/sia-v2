/** Stable 0-3 identity slot for an agent id; drives the agent's hue everywhere it appears. */
export function agentIdentity(agentId: string): number {
  let hash = 0;
  for (const character of agentId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 4;
}
