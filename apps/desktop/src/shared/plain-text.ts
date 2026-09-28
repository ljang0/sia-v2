/** Flattens common Markdown to one line of readable text for short previews. */
export function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*])/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortens text without splitting a grapheme (emoji, accents) and, when practical, a word. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let clipped = '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    text,
  )) {
    if (clipped.length + segment.length > max - 1) break;
    clipped += segment;
  }
  const boundary = clipped.search(/\s+\S*$/);
  if (boundary > max * 0.6) clipped = clipped.slice(0, boundary);
  return `${clipped.trimEnd()}…`;
}

/** A short conversation title from the person's first request: plain text, no raw URLs. */
export function conversationTitle(request: string): string {
  const words = plainText(request)
    .replace(/https?:\/\/(?:www\.)?([^\s/?#]+)\S*/gi, '$1')
    .split(' ')
    .slice(0, 7)
    .join(' ');
  return clipText(words, 52);
}
