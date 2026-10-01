import { CaretDown, CaretUp, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Dispatch, SetStateAction } from 'react';
import buttons from '../../styles/buttons.module.css';
import styles from '../Conversation.module.css';
import { findCountLabel } from './conversationModel';

interface ConversationFindProps {
  query: string;
  onQueryChange(query: string): void;
  index: number;
  onIndexChange: Dispatch<SetStateAction<number>>;
  matchCount: number;
  onClose(): void;
}

/** Find in this thread: the search field, its match count, and stepping between matches. */
export function ConversationFind({
  query,
  onQueryChange,
  index,
  onIndexChange,
  matchCount,
  onClose,
}: ConversationFindProps) {
  return (
    <div className={styles.conversationFind} role="search">
      <MagnifyingGlass size={15} aria-hidden="true" />
      <input
        autoFocus
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Enter' && matchCount) {
            event.preventDefault();
            onIndexChange((current) =>
              event.shiftKey
                ? (current - 1 + matchCount) % matchCount
                : (current + 1) % matchCount,
            );
          }
        }}
        placeholder="Find in this thread"
        aria-label="Find in this thread"
      />
      <span className={styles.findCount} aria-live="polite">
        {findCountLabel(query, index, matchCount)}
      </span>
      <button
        type="button"
        className={buttons.iconButtonSmall}
        disabled={!matchCount}
        onClick={() => onIndexChange((current) => (current - 1 + matchCount) % matchCount)}
        aria-label="Previous match"
      >
        <CaretUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttons.iconButtonSmall}
        disabled={!matchCount}
        onClick={() => onIndexChange((current) => (current + 1) % matchCount)}
        aria-label="Next match"
      >
        <CaretDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttons.iconButtonSmall}
        onClick={() => onClose()}
        aria-label="Close find"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
