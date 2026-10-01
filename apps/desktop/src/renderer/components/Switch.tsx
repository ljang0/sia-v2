import type { InputHTMLAttributes } from 'react';
import styles from './Switch.module.css';

/**
 * The one on/off control for settings. It is a native checkbox with the switch role, so labels,
 * keyboard, and forms work as usual, drawn as a switch.
 */
export function Switch({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return (
    <input
      {...props}
      type="checkbox"
      role="switch"
      className={className ? `${styles.switch} ${className}` : styles.switch}
    />
  );
}
