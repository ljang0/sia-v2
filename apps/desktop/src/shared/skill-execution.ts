import type { AssistantSkill } from './assistant-library.js';

export function skillExecutionMode(
  computer: { accessMode?: 'mac' | 'connected'; backgroundControl?: boolean },
  visionOnly = true,
): 'native' | 'gateway' {
  if (visionOnly) return 'gateway';
  return computer.accessMode === 'mac' && !computer.backgroundControl ? 'native' : 'gateway';
}

export function skillUnavailableReason(
  mode: 'native' | 'gateway',
  execution: AssistantSkill['execution'],
  visionOnly = true,
): string | undefined {
  if (visionOnly && execution === 'native')
    return 'Native scripts are unavailable with vision-only control. Saved source remains editable.';
  if ((execution ?? 'gateway') === mode) return undefined;
  return execution === 'native'
    ? 'Choose On my screen in Settings → Computer to run native skills.'
    : 'This skill uses gateway tools. Choose Background or Connected apps, or create a native skill for On my screen.';
}
