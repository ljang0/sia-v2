import {
  ArrowUpRight,
  Bug,
  CalendarBlank,
  Article,
  GitDiff,
  ListBullets,
  MagnifyingGlass,
  Notebook,
  Question,
  Scales,
  type Icon,
} from '@phosphor-icons/react';
import type { StarterPrompt } from '../welcome';
import styles from '../ui.module.css';

const ICONS: Record<StarterPrompt['icon'], Icon> = {
  calendar: CalendarBlank,
  page: Article,
  search: MagnifyingGlass,
  compare: Scales,
  notes: Notebook,
  question: Question,
  review: GitDiff,
  summary: ListBullets,
  bug: Bug,
};

/** Suggested first tasks. Each card sends its full request, so the first task is one click. */
export function StarterPrompts({
  prompts,
  onSend,
}: {
  prompts: readonly StarterPrompt[];
  onSend(prompt: string): void;
}) {
  if (!prompts.length) return null;
  return (
    <div className={styles.starterPrompts} role="group" aria-label="Suggested starts">
      {prompts.map(({ icon, title, prompt }) => {
        const StarterIcon = ICONS[icon];
        return (
          <button key={prompt} type="button" onClick={() => onSend(prompt)}>
            <span className={styles.starterIcon} aria-hidden="true">
              <StarterIcon size={17} />
            </span>
            <span className={styles.starterText}>
              <strong>{title}</strong>
              <span>{prompt}</span>
            </span>
            <ArrowUpRight className={styles.starterArrow} size={14} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
