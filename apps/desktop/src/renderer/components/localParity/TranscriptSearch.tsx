import { MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import type { TranscriptSearchResult } from '../../types';
import surface from './localParity.module.css';

interface TranscriptSearchProps {
  search(query: string): Promise<TranscriptSearchResult[]>;
  onOpen(threadId: string, archived: boolean): void;
  focusOnMount?: boolean | undefined;
}

export function TranscriptSearch({
  search,
  onOpen,
  focusOnMount = false,
}: TranscriptSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TranscriptSearchResult[]>([]);
  const labelId = useId();

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void search(normalized).then(
        (next) => current && setResults(next),
        () => current && setResults([]),
      );
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  return (
    <section className={surface.transcriptSearch} aria-labelledby={labelId}>
      <div className={surface.localSurfaceHeader}>
        <h2 id={labelId}>Search conversations</h2>
      </div>
      <label className={surface.threadSearch}>
        <MagnifyingGlass size={14} aria-hidden="true" />
        <input
          autoFocus={focusOnMount}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find something that was said"
          aria-label="Search message text"
          data-testid="thread-search-input"
        />
      </label>
      <div className={surface.transcriptSearchResults} data-testid="transcript-search-results">
        {results.flatMap((result) =>
          result.matches.map((match) => (
            <button
              type="button"
              key={`${result.threadId}-${match.itemId}`}
              onClick={() => onOpen(result.threadId, result.archived)}
              data-testid="transcript-search-result"
            >
              <strong>{result.threadTitle}</strong>
              <span>{match.excerpt}</span>
              {result.archived ? <small>Archived</small> : null}
            </button>
          )),
        )}
        {!query.trim() ? (
          <p className={surface.localEmpty}>
            Finds words in any conversation, including archived ones.
          </p>
        ) : results.length === 0 ? (
          <p className={surface.localEmpty}>No conversations mention “{query.trim()}”.</p>
        ) : null}
      </div>
    </section>
  );
}
