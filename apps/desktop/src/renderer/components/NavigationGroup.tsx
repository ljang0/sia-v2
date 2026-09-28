import { CaretRight } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import styles from './navigation.module.css';

/** Sia's adaptation of the supplied multi-level collapsible menu. */
export function NavigationGroup({
  label,
  icon,
  open,
  selected,
  identity,
  attention = 0,
  onToggle,
  actions,
  children,
}: {
  label: string;
  icon: ReactNode;
  open: boolean;
  selected: boolean;
  identity: number;
  /** Conversations waiting on the person; shown while the group is closed. */
  attention?: number;
  onToggle(): void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={styles.group} data-identity={identity} data-selected={selected}>
      <div className={styles.groupHeader} data-open={open}>
        <button
          className={styles.groupTrigger}
          type="button"
          aria-label={!open && attention ? `${label}, ${attention} need you` : label}
          title={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <span className={styles.groupIcon} aria-hidden="true">
            {icon}
          </span>
          <span className={styles.groupLabel}>{label}</span>
          {!open && attention ? (
            <span className={styles.groupBadge} aria-hidden="true">
              {attention}
            </span>
          ) : null}
          <CaretRight className={styles.chevron} size={15} aria-hidden="true" />
        </button>
        <div className={styles.groupActions}>{actions}</div>
      </div>
      <div
        id={id}
        className={styles.groupContent}
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={styles.groupClip}>{children}</div>
      </div>
    </section>
  );
}
