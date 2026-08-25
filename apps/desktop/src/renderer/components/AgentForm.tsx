import companion from '../companion.module.css';
import type { SiaPresenceState } from './SiaPresence';

/** An abstract, living identity form. Hue slots remain the persisted identity contract. */
export function AgentForm({
  identity = 0,
  state = 'idle',
  size = 'medium',
  className,
}: {
  identity?: number | undefined;
  state?: SiaPresenceState | undefined;
  size?: 'small' | 'medium' | 'large' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={`${companion.agentForm} ${className ?? ''}`}
      data-identity={identity}
      data-state={state}
      data-size={size}
      aria-hidden="true"
    >
      <span className={companion.agentFormBody}>
        <span className={companion.agentFormOrbit} />
        <span className={companion.agentFormCore} />
      </span>
    </span>
  );
}
