/** Flattens common Markdown to one line of readable text for short previews. */
export function plainText(markdown: string) {
  // Previews read provider output; a missing body previews as empty, not as a crash.
  return (typeof markdown === 'string' ? markdown : '')
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

/** The title a conversation has until its first message names it. */
export const UNTITLED_THREAD_TITLE = 'New thread';

const CONVERSATION_TITLE_MAX = 80;

/**
 * A conversation title from the person's first request: plain text, no raw URLs. A long
 * request ends in an ellipsis instead of stopping mid-sentence; the header and sidebar clip
 * further with CSS and show the whole title on hover.
 */
export function conversationTitle(request: string): string {
  const text = plainText(request).replace(/https?:\/\/(?:www\.)?([^\s/?#]+)\S*/gi, '$1');
  return clipText(text, CONVERSATION_TITLE_MAX);
}
