/** Current host context belongs to the request, not the cached provider-session instructions. */
export function taskClock(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);
  return `<task_clock>${JSON.stringify({ utc: now.toISOString(), local, timeZone })}</task_clock>\nInterpret relative dates in this timezone unless the person specifies another. Verify the current term and account in the requested source; the clock alone does not establish enrollment or course coverage.`;
}
