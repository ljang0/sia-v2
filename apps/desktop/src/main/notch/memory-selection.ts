/** Local, bounded retrieval. Notes remain historical data, never live app evidence. */
const ignored = new Set(
  'a an and are as at be been can check could do find for from get give have how i in is it its look me my of on or our please read show so some tell that the their them there these they this to us use want was we what when where which who will with would you your'.split(
    ' ',
  ),
);
const groups = [
  ['account', 'accounts', 'profile', 'identity', 'organization'],
  ['calendar', 'calendars', 'schedule', 'scheduling', 'appointment', 'appointments'],
  ['course', 'courses', 'class', 'classes', 'campus', 'school', 'university', 'semester'],
  ['assignment', 'assignments', 'homework', 'coursework', 'deadline', 'deadlines'],
  ['professor', 'professors', 'instructor', 'instructors', 'teaching'],
];
const tokens = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => !ignored.has(word)),
  );
const core = new Set(['MOC.md', 'journal.md', 'failures.log', 'lessons.md', 'preferences.md']);

export function selectMemoryNotes(
  request: string,
  index: string,
  names: readonly string[],
): string[] {
  const query = tokens(request.slice(0, 16_000));
  if (!query.size) return [];
  for (const group of groups)
    if (group.some((word) => query.has(word))) for (const word of group) query.add(word);
  const descriptions = new Map<string, string>();
  for (const line of index.slice(0, 60_000).split('\n')) {
    for (const match of line.matchAll(
      /\[\[([a-zA-Z0-9][a-zA-Z0-9_-]{0,100})(?:\.md)?(?:\|[^\]]*)?\]\]/g,
    )) {
      const name = match[1] + '.md';
      descriptions.set(
        name,
        `${descriptions.get(name) ?? ''} ${line.slice(0, 400)}`.slice(0, 1200),
      );
    }
  }
  const personal = /\b(?:my|our|me)\b/i.test(request);
  // Rank metadata before bounding reads; a note's alphabetical position must
  // not make it disappear as more memories accumulate.
  return names
    .filter((name) => !core.has(name) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.md$/.test(name))
    .map((name) => {
      const filename = tokens(name.slice(0, -3));
      const description = tokens(descriptions.get(name) ?? '');
      let score = 0;
      for (const word of query) {
        if (filename.has(word)) score += 3;
        if (description.has(word)) score += 1;
      }
      // Established identity can disambiguate "my campus" and spoken names.
      if (
        personal &&
        descriptions.has(name) &&
        /^(?:profile|accounts|about-me)\.md$/.test(name)
      )
        score += 2;
      return { name, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 4)
    .map(({ name }) => name);
}
