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
import { SpotlightButton } from './effects/SpotlightButton';
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

/** Suggested first tasks. Choosing a card opens its full request as an editable draft. */
export function StarterPrompts({
  prompts,
  onChoose,
}: {
  prompts: readonly StarterPrompt[];
  onChoose(prompt: string): void;
}) {
  if (!prompts.length) return null;
  return (
    <div className={styles.starterPrompts} role="group" aria-label="Suggested starts">
      {prompts.map(({ icon, title, prompt }) => {
        const StarterIcon = ICONS[icon];
        return (
          <SpotlightButton key={prompt} type="button" onClick={() => onChoose(prompt)}>
            <span className={styles.starterIcon} aria-hidden="true">
              <StarterIcon size={18} />
            </span>
            <span className={styles.starterText}>
              <strong>{title}</strong>
              <span>{prompt}</span>
            </span>
            <ArrowUpRight className={styles.starterArrow} size={16} aria-hidden="true" />
          </SpotlightButton>
        );
      })}
    </div>
  );
}
