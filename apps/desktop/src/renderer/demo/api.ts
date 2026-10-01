import type { RendererApi, RendererSnapshot } from '../types';
import { clone } from './context';
import { demoConversationApi } from './conversationApi';
import { demoSettingsApi } from './settingsApi';
import { demoSnapshot } from './snapshot';
import { demoWorkApi } from './workApi';

/** An in-memory bridge for the renderer demo (`#demo`) and renderer tests. */
export function createDemoRendererApi(seed = demoSnapshot): RendererApi {
  const snapshot = clone(seed);
  const listeners = new Set<(next: RendererSnapshot) => void>();

  const emit = () => {
    const next = clone(snapshot);
    listeners.forEach((listener) => listener(next));
  };

  const mutate = (update: (current: RendererSnapshot) => void) => {
    update(snapshot);
    emit();
  };

  const context = { snapshot, listeners, mutate };
  return {
    ...demoConversationApi(context),
    ...demoWorkApi(context),
    ...demoSettingsApi(context),
  };
}
