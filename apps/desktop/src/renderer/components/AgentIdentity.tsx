import { useEffect, useRef, useState } from 'react';
import { AgentForm } from './AgentForm';
import styles from './AgentIdentity.module.css';

/**
 * The agent's look as it will appear in the sidebar and its room, updating as the person names it.
 * Sia assigns a new agent's colour when it is saved, so until then the form stays neutral rather
 * than promising one; an existing agent shows its own. While the person types its name, the form
 * leans in and its core pulses, as if listening.
 */
export function AgentIdentityPreview({
  identity,
  name,
}: {
  identity: number | undefined;
  name: string;
}) {
  const listening = useListening(name);
  return (
    <div
      className={styles.preview}
      data-auto={identity === undefined || undefined}
      data-listening={listening || undefined}
    >
      <AgentForm
        identity={identity ?? 0}
        state={listening ? 'speaking' : 'idle'}
        size="large"
        className={styles.previewForm}
      />
      <span className={styles.previewName}>{name.trim() || 'New agent'}</span>
    </div>
  );
}

/** True for a moment after `value` changes, never on the first render. */
function useListening(value: string, settle = 700): boolean {
  const [listening, setListening] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return undefined;
    previous.current = value;
    setListening(true);
    const timer = window.setTimeout(() => setListening(false), settle);
    return () => window.clearTimeout(timer);
  }, [value, settle]);
  return listening;
}
