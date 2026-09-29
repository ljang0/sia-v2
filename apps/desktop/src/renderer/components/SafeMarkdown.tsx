import { createElement, Fragment, memo, type ReactNode } from 'react';
import styles from '../ui.module.css';

/**
 * Renders the Markdown surface returned by provider CLIs. React escapes all source text,
 * raw HTML is never interpreted, remote images are never loaded, and only HTTPS links become
 * interactive.
 */
export const SafeMarkdown = memo(function SafeMarkdown({ content }: { content: string }) {
  return <>{renderBlocks(content.replaceAll('\r\n', '\n').split('\n'), 'md')}</>;
});

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([\w.+-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>\s?/;
const LIST_ITEM = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function renderBlocks(lines: readonly string[], keyPrefix: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const key = `${keyPrefix}-${index}`;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const [, indent = '', marker = '```', info = ''] = fence;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceClose(lines[index] ?? '', marker)) {
        code.push(stripIndent(lines[index] ?? '', indent.length));
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = info.replaceAll(/[^\w.+-]/g, '');
      blocks.push(
        <pre className={styles.markdownCodeBlock} key={key}>
          <code className={language ? `language-${language}` : undefined}>
            {code.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    if (RULE.test(line)) {
      blocks.push(<hr className={styles.markdownRule} key={key} />);
      index += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min((heading[1]?.length ?? 1) + 1, 6);
      blocks.push(
        createElement(
          `h${level}`,
          { className: styles.markdownHeading, key },
          renderInline(heading[2] ?? ''),
        ),
      );
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const alignments = splitRow(lines[index + 1] ?? '').map(alignment);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push(
        <div className={styles.markdownTableWrap} key={key}>
          <table className={styles.markdownTable}>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} data-align={alignments[cellIndex]}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex} data-align={alignments[cellIndex]}>
                      {renderInline(row[cellIndex] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const list = readList(lines, index);
      const items = list.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderListItem(item, `${key}-${itemIndex}`)}</li>
      ));
      blocks.push(
        list.ordered ? (
          <ol
            className={styles.markdownList}
            key={key}
            start={list.start === 1 ? undefined : list.start}
          >
            {items}
          </ol>
        ) : (
          <ul className={styles.markdownList} key={key}>
            {items}
          </ul>
        ),
      );
      index = list.next;
      continue;
    }

    if (QUOTE.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(QUOTE, ''));
        index += 1;
      }
      blocks.push(
        <blockquote className={styles.markdownQuote} key={key}>
          {renderBlocks(quote, key)}
        </blockquote>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? '').trim() && !startsBlock(lines, index)) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    blocks.push(<p key={key}>{renderLines(paragraph)}</p>);
  }

  return blocks;
}

interface ListItemSource {
  first: string;
  rest: string[];
}

/**
 * Reads one list. Indented sub-lists, continuation lines, and blank-line separated ("loose")
 * items stay inside the same list, so numbered steps keep their numbers.
 */
function readList(lines: readonly string[], start: number) {
  const opener = (lines[start] ?? '').match(LIST_ITEM);
  const indent = opener?.[1]?.length ?? 0;
  const ordered = /\d/.test(opener?.[2] ?? '');
  const items: ListItemSource[] = [];
  let next = start;

  while (next < lines.length) {
    const match = (lines[next] ?? '').match(LIST_ITEM);
    if (!match || (match[1]?.length ?? 0) > indent + 1) break;
    if (/\d/.test(match[2] ?? '') !== ordered) break;
    const contentColumn = (match[1]?.length ?? 0) + (match[2]?.length ?? 1) + 1;
    const item: ListItemSource = { first: match[3] ?? '', rest: [] };
    next += 1;
    while (next < lines.length) {
      const candidate = lines[next] ?? '';
      if (!candidate.trim()) {
        const following = lines.slice(next + 1).find((value) => value.trim());
        if (following === undefined || leadingSpaces(following) <= indent) break;
        item.rest.push('');
        next += 1;
        continue;
      }
      const lineIndent = leadingSpaces(candidate);
      if (lineIndent > indent) {
        item.rest.push(stripIndent(candidate, Math.min(lineIndent, contentColumn)));
        next += 1;
        continue;
      }
      // A lazy continuation line directly after the item's first line.
      if (item.rest.length === 0 && !startsBlock(lines, next)) {
        item.rest.push(candidate.trim());
        next += 1;
        continue;
      }
      break;
    }
    items.push(item);
    let peek = next;
    while (peek < lines.length && !(lines[peek] ?? '').trim()) peek += 1;
    const sibling = (lines[peek] ?? '').match(LIST_ITEM);
    if (
      peek > next &&
      sibling &&
      (sibling[1]?.length ?? 0) <= indent + 1 &&
      /\d/.test(sibling[2] ?? '') === ordered
    ) {
      next = peek;
    }
  }

  const first = Number.parseInt(opener?.[2] ?? '1', 10);
  return { items, next, ordered, start: Number.isFinite(first) ? first : 1 };
}

function renderListItem(item: ListItemSource, key: string): ReactNode {
  const lead = [item.first];
  let rest = item.rest;
  while (rest.length && rest[0]?.trim() && !startsBlock(rest, 0)) {
    lead.push((rest[0] ?? '').trim());
    rest = rest.slice(1);
  }
  const task = lead[0]?.match(/^\[([ xX])\]\s+(.*)$/);
  if (task) lead[0] = task[2] ?? '';
  return (
    <>
      {task ? (
        <input
          type="checkbox"
          className={styles.markdownTaskBox}
          checked={task[1] !== ' '}
          disabled
          readOnly
        />
      ) : null}
      {renderLines(lead)}
      {rest.length ? renderBlocks(rest, key) : null}
    </>
  );
}

function startsBlock(lines: readonly string[], index: number) {
  const line = lines[index] ?? '';
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    LIST_ITEM.test(line) ||
    QUOTE.test(line) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines: readonly string[], index: number) {
  const line = lines[index] ?? '';
  const delimiter = lines[index + 1] ?? '';
  return (
    line.includes('|') &&
    delimiter.includes('-') &&
    TABLE_DELIMITER.test(delimiter) &&
    (delimiter.includes('|') || line.trim().startsWith('|'))
  );
}

function splitRow(row: string): string[] {
  let value = row.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function alignment(cell: string): 'left' | 'right' | 'center' | undefined {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined;
}

function isFenceClose(line: string, marker: string) {
  const trimmed = line.trim();
  const character = marker[0] ?? '`';
  return trimmed.length >= marker.length && [...trimmed].every((value) => value === character);
}

function leadingSpaces(line: string) {
  return line.length - line.trimStart().length;
}

function stripIndent(line: string, count: number) {
  let removed = 0;
  while (removed < count && line[removed] === ' ') removed += 1;
  return line.slice(removed);
}

/** Keeps the author's line breaks, as chat apps do for addresses and short notes. */
function renderLines(lines: readonly string[]): ReactNode[] {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {renderInline(line)}
    </Fragment>
  ));
}

const LINK_TARGET = '\\((?:[^()\\s]|\\([^()\\s]*\\))+\\)';
const INLINE_TOKEN = new RegExp(
  [
    '`[^`\\n]+`',
    `!\\[[^\\]\\n]*\\]${LINK_TARGET}`,
    `\\[[^\\]\\n]+\\]${LINK_TARGET}`,
    '<https://[^\\s>]+>',
    'https?://[^\\s<>]+',
    '\\*\\*(?=\\S)[^*\\n]*?\\S\\*\\*',
    '(?<![\\p{L}\\p{N}_])__(?=\\S)[^_\\n]*?\\S__(?![\\p{L}\\p{N}_])',
    '~~(?=\\S)[^~\\n]*?\\S~~',
    '\\*(?=[^\\s*])[^*\\n]*?[^\\s*]\\*',
    '(?<![\\p{L}\\p{N}_])_(?=[^\\s_])[^_\\n]*?[^\\s_]_(?![\\p{L}\\p{N}_])',
  ].join('|'),
  'gu',
);

function renderInline(value: string): ReactNode[] {
  const output: ReactNode[] = [];
  const tokenPattern = new RegExp(INLINE_TOKEN);
  let cursor = 0;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(value))) {
    let source = token[0];
    if (/^https?:\/\//.test(source)) source = trimUrl(source);
    if (token.index > cursor) output.push(value.slice(cursor, token.index));
    const key = `${token.index}-${source}`;
    if (source.startsWith('`')) {
      output.push(<code key={key}>{source.slice(1, -1)}</code>);
    } else if (source.startsWith('![') || source.startsWith('[')) {
      // Remote images are never loaded; an image is offered as a link to its source.
      const link = source.match(/^!?\[([^\]]*)\]\((.+)\)$/);
      output.push(externalLink(safeHref(link?.[2]), link?.[1] || link?.[2] || source, key));
    } else if (source.startsWith('<')) {
      const url = source.slice(1, -1);
      output.push(externalLink(safeHref(url), url, key));
    } else if (/^https?:\/\//.test(source)) {
      output.push(externalLink(safeHref(source), source, key));
    } else if (source.startsWith('**') || source.startsWith('__')) {
      output.push(<strong key={key}>{renderInline(source.slice(2, -2))}</strong>);
    } else if (source.startsWith('~~')) {
      output.push(<del key={key}>{renderInline(source.slice(2, -2))}</del>);
    } else {
      output.push(<em key={key}>{renderInline(source.slice(1, -1))}</em>);
    }
    cursor = token.index + source.length;
    tokenPattern.lastIndex = cursor;
  }

  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

function externalLink(href: string | undefined, label: string, key: string) {
  return href ? (
    <a href={href} key={key} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span key={key}>{label}</span>
  );
}

/** Drops sentence punctuation and an unbalanced closing parenthesis from a bare URL. */
function trimUrl(url: string) {
  let value = url.replace(/[.,;:!?'"]+$/, '');
  while (value.endsWith(')') && count(value, '(') < count(value, ')')) {
    value = value.slice(0, -1).replace(/[.,;:!?'"]+$/, '');
  }
  return value;
}

function count(value: string, character: string) {
  return value.split(character).length - 1;
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
