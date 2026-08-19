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
});
