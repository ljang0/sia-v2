import { createElement, type ReactNode } from 'react';
import styles from '../ui.module.css';

/**
 * Renders the small Markdown surface returned by provider CLIs. React escapes all source text,
 * raw HTML is never interpreted, and only HTTPS links become interactive.
 */
export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w.+-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1]?.replaceAll(/[^\w.+-]/g, '');
      blocks.push(
        <pre className={styles.markdownCodeBlock} key={`code-${index}`}>
          <code className={language ? `language-${language}` : undefined}>
            {code.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min((heading[1]?.length ?? 1) + 1, 6);
      blocks.push(
        createElement(
          `h${level}`,
          { className: styles.markdownHeading, key: `heading-${index}` },
          renderInline(heading[2] ?? ''),
        ),
      );
      index += 1;
      continue;
    }

    const unordered = readList(lines, index, /^\s*[-+*]\s+(.+)$/);
    if (unordered) {
      blocks.push(
        <ul className={styles.markdownList} key={`ul-${index}`}>
          {unordered.items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      index = unordered.next;
      continue;
    }

    const ordered = readList(lines, index, /^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      blocks.push(
        <ol className={styles.markdownList} key={`ol-${index}`}>
          {ordered.items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      index = ordered.next;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote className={styles.markdownQuote} key={`quote-${index}`}>
          {renderInline(quote.join(' '))}
        </blockquote>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !startsBlock(lines[index] ?? '')
    ) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }

  return <>{blocks}</>;
}

function readList(lines: string[], start: number, pattern: RegExp) {
  const items: string[] = [];
  let next = start;
  while (next < lines.length) {
    const match = (lines[next] ?? '').match(pattern);
    if (!match) break;
    items.push(match[1] ?? '');
    next += 1;
  }
  return items.length ? { items, next } : undefined;
}

function startsBlock(line: string) {
  return (
    /^```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-+*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^>\s?/.test(line)
  );
}

function renderInline(value: string): ReactNode[] {
  const tokenPattern =
    /(`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(value))) {
    if (token.index > cursor) output.push(value.slice(cursor, token.index));
    const source = token[0];
    const key = `${token.index}-${source}`;
    if (source.startsWith('`')) {
      output.push(<code key={key}>{source.slice(1, -1)}</code>);
    } else if (source.startsWith('[')) {
      const link = source.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = link?.[1] ?? source;
      const href = safeHref(link?.[2]);
      output.push(
        href ? (
          <a href={href} key={key} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    } else if (source.startsWith('**') || source.startsWith('__')) {
      output.push(<strong key={key}>{renderInline(source.slice(2, -2))}</strong>);
    } else {
      output.push(<em key={key}>{renderInline(source.slice(1, -1))}</em>);
    }
    cursor = token.index + source.length;
  }

  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

function safeHref(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
