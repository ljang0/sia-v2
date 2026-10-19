import { ArrowUp, SpinnerGap, Stop } from '@phosphor-icons/react';
import type { ComponentPropsWithoutRef } from 'react';
import { LiquidMetalButton } from './effects/liquid-metal-button';
import './send-button.css';

export type SendState = 'idle' | 'ready' | 'sending' | 'working' | 'stopping';
/** 21st Agent Elements' send/stop state pattern, using Sia's accessible button surface. */
export function SendButton({
  state,
  showLabel = false,
  className = '',
  disabled,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof LiquidMetalButton> & {
  state: SendState;
  showLabel?: boolean;
}) {
  const stopping = state === 'working' || state === 'stopping';
  const pending = state === 'sending' || state === 'stopping';
  return (
    <LiquidMetalButton
      {...props}
      size="compact"
      viewMode={showLabel ? 'text' : 'icon'}
      tone={props.tone ?? (stopping ? 'neutral' : 'sage')}
      className={`sia-send-button ${className}`}
      data-send-state={state}
      aria-label={props['aria-label'] ?? (stopping ? 'Stop task' : 'Send message')}
      aria-busy={pending || undefined}
      disabled={disabled || state === 'idle' || pending}
    >
      <span
        className="send-glyph"
        key={pending ? 'pending' : stopping ? 'stop' : 'send'}
        aria-hidden="true"
      >
        {pending ? (
          <SpinnerGap size={18} className="send-spinner" />
        ) : stopping ? (
          <Stop size={14} weight="fill" />
        ) : (
          <ArrowUp size={18} weight="bold" />
        )}
      </span>
      {showLabel ? (
        <span>
          {children ??
            (state === 'stopping'
              ? 'Stopping…'
              : stopping
                ? 'Stop'
                : state === 'sending'
                  ? 'Sending…'
                  : 'Send')}
        </span>
      ) : null}
    </LiquidMetalButton>
  );
}
