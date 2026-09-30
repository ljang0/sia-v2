import {
  ArrowUpRight,
  Bug,
  CalendarBlank,
  Article,
  ChatsCircle,
  EnvelopeSimple,
  FileText,
  GitDiff,
  ListBullets,
  ListChecks,
  MagnifyingGlass,
  MoonStars,
  Notebook,
  PencilSimpleLine,
  Question,
  Scales,
  type Icon,
} from '@phosphor-icons/react';
import type { StarterPrompt } from '../welcome';
import styles from './StarterPrompts.module.css';

const ICONS: Record<StarterPrompt['icon'], Icon> = {
  calendar: CalendarBlank,
  todo: ListChecks,
  moon: MoonStars,
  mail: EnvelopeSimple,
  chats: ChatsCircle,
  document: FileText,
  page: Article,
  write: PencilSimpleLine,
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
