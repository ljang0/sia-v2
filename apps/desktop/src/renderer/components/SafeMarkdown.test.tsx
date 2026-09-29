// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

afterEach(cleanup);

describe('SafeMarkdown', () => {
  it('renders useful provider Markdown while keeping raw HTML and unsafe links inert', () => {
    render(
      <SafeMarkdown
        content={[
          '## Result',
          '- first item',
          '- second item with `inline code`',
          '',
          '[Official docs](https://example.com/docs)',
          '[Unsafe link](javascript:alert(1))',
          '',
          '```ts',
          'const answer = 42;',
          '```',
          '',
          '<img src=x onerror=alert(1)>',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy();
    expect(screen.getByRole('list').children).toHaveLength(2);
    expect(screen.getByText('inline code').tagName).toBe('CODE');
    const safeLink = screen.getByRole('link', { name: 'Official docs' });
    expect(safeLink.getAttribute('href')).toBe('https://example.com/docs');
    expect(screen.queryByRole('link', { name: 'Unsafe link' })).toBeNull();
    expect(screen.getByText('Unsafe link').tagName).toBe('SPAN');
    expect(screen.getByText('const answer = 42;').tagName).toBe('CODE');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('keeps numbered steps, tables, file names, and long links readable', () => {
    const { container } = render(
      <SafeMarkdown
        content={[
          '| Store | Price |',
          '|---|---:|',
          '| Target | $24.99 |',
          '',
          '1. **Book the flight**',
          '   - Use the United app',
          '2. Reserve the hotel',
          '',
          '3. Pack',
          '',
          'Saved to my_trip_notes_final.md. Total is 2 * 3 * 4.',
          'See [Python](https://en.wikipedia.org/wiki/Python_(programming_language)).',
          'Receipt: https://example.com/orders/1?session=abc.',
          '![Chart](https://example.com/chart.png)',
          '',
          '---',
          '',
          'Jane Doe',
          '123 Main St',
          '',
          '- [x] Hotel booked',
          '',
          '~~Old plan~~',
        ].join('\n')}
      />,
    );

    const table = screen.getByRole('table');
    expect(table.querySelectorAll('th')).toHaveLength(2);
    expect(table.querySelector('td[data-align="right"]')?.textContent).toBe('$24.99');

    const steps = container.querySelectorAll('ol');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.children).toHaveLength(3);
    expect(steps[0]!.querySelector('li > ul')?.textContent).toBe('Use the United app');

    expect(screen.getByText(/my_trip_notes_final\.md/)).toBeTruthy();
    expect(container.querySelector('em')).toBeNull();
    expect(screen.getByRole('link', { name: 'Python' }).getAttribute('href')).toBe(
      'https://en.wikipedia.org/wiki/Python_(programming_language)',
    );
    expect(
      screen.getByRole('link', { name: 'https://example.com/orders/1?session=abc' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chart' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).not.toContain('![');
    expect(container.querySelector('hr')).toBeTruthy();
    const address = [...container.querySelectorAll('p')].find((paragraph) =>
      paragraph.textContent?.startsWith('Jane Doe'),
    );
    expect(address?.querySelector('br')).toBeTruthy();
    expect(screen.getByRole('checkbox', { checked: true })).toBeTruthy();
    expect(screen.getByText('Old plan').tagName).toBe('DEL');
  });
});
