import type { ComponentPropsWithoutRef } from 'react';
import './action-button.css';

type Props = ComponentPropsWithoutRef<'button'> & {
  viewMode?: 'text' | 'icon';
  tone?: 'neutral' | 'accent' | 'danger';
  size?: 'regular' | 'compact';
};

/**
 * The shared primary-action button for the desktop and phone: a solid accent (or quiet neutral)
 * fill with a hairline edge and a faint top highlight. Icon buttons are round.
 */
export function ActionButton({
  viewMode = 'text',
  tone = 'neutral',
  size = 'regular',
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      className={`action-button ${className}`}
      data-tone={tone}
      data-view={viewMode}
      data-size={size}
    />
  );
}
