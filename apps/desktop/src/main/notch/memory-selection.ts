/** Local, bounded retrieval. Notes remain historical data, never live app evidence. */
const ignored = new Set(
  'a an and are as at be been can check could do find for from get give have hello hey hi how i in is it its look me my of ok okay on or our please read show so some tell thanks that the their them there these they this to us use want was we what when where which who will with would you your'.split(
    ' ',
  ),
);
const groups = [
  ['account', 'accounts', 'profile', 'identity', 'organization'],
  [
    'calendar',
    'calendars',
    'schedule',
    'scheduling',
    'appointment',
    'appointments',
    'event',
    'events',
  ],
  [
    'course',
    'courses',
    'class',
    'classes',
    'campus',
    'school',
    'university',
    'semester',
    'canvas',
    'instructure',
  ],
  ['assignment', 'assignments', 'homework', 'coursework', 'deadline', 'deadlines', 'due'],
  ['professor', 'professors', 'instructor', 'instructors', 'teaching'],
  ['cmu', 'carnegie', 'mellon'],
  ['handshake', 'joinhandshake', 'career', 'careers', 'recruiting'],
];
const tokens = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => !ignored.has(word)),
  );
const core = new Set(['MOC.md', 'journal.md', 'failures.log', 'lessons.md', 'preferences.md']);
export const isSearchableMemoryNote = (name: string) =>
  !core.has(name) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.md$/.test(name);

function queryWeights(request: string, context = ''): Map<string, number> {
  const own = tokens(request.slice(0, 16_000));
  if (!own.size && !/\b(?:it|that|those|same|continue|resume)\b/i.test(request))
    return new Map();
  const query = new Map([...own].map((word) => [word, 1]));
  // Prior context helps short follow-ups, but never outweighs the current request.
  if (own.size < 6)
    for (const word of tokens(context.slice(-3000))) if (!query.has(word)) query.set(word, 0.3);
  for (const group of groups) {
    const weight = Math.max(0, ...group.map((word) => query.get(word) ?? 0));
    if (weight) for (const word of group) if (!query.has(word)) query.set(word, weight * 0.7);
  }
  return query;
}

export const hasMemoryQuery = (request: string, context = '') =>
  queryWeights(request, context).size > 0;

export function memoryMatchScore(text: string, request: string, context = ''): number {
  const words = tokens(text);
  let score = 0;
  for (const [word, weight] of queryWeights(request, context))
    if (words.has(word)) score += weight;
  return score;
}

/** Keep a contiguous passage around the strongest match, not always the note's beginning. */
export function memoryExcerpt(text: string, request: string, context = '', limit = 4000) {
  if (text.length <= limit) return { text, truncated: false };
  let best = 0;
  let score = -1;
  for (let start = 0; start < text.length; start += 800) {
    const candidate = memoryMatchScore(text.slice(start, start + 1200), request, context);
    if (candidate > score) {
      score = candidate;
      best = start;
    }
  }
  const start = Math.max(0, Math.min(best - 400, text.length - limit));
  return { text: text.slice(start, start + limit), truncated: true };
}

export function selectMemoryNotes(
  request: string,
  index: string,
  names: readonly string[],
  contents: ReadonlyMap<string, string> = new Map(),
  context = '',
): string[] {
  const query = queryWeights(request, context);
  if (!query.size) return [];
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
    .filter(isSearchableMemoryNote)
    .map((name) => {
      const filename = tokens(name.slice(0, -3));
      const description = tokens(descriptions.get(name) ?? '');
      let score = 0;
      for (const [word, weight] of query) {
        if (filename.has(word)) score += 3 * weight;
        if (description.has(word)) score += weight;
      }
      score += memoryMatchScore(contents.get(name) ?? '', request, context);
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
