import { describe, expect, it } from 'vitest';
import { createDemoRendererApi } from './api';
import { demoSnapshot } from './snapshot';

describe('demo renderer API', () => {
  it('returns copies so callers cannot mutate the backing state', async () => {
    const api = createDemoRendererApi();
    const first = await api.getSnapshot();
    first.agents[0]!.name = 'Changed outside the API';

    const second = await api.getSnapshot();
    expect(second.agents[0]!.name).toBe(demoSnapshot.agents[0]!.name);
  });

  it('publishes capture and thread selection changes', async () => {
    const api = createDemoRendererApi();
    const states: string[] = [];
    const unsubscribe = api.subscribe((snapshot) => {
      states.push(`${snapshot.research.capture}:${snapshot.selectedThreadId ?? 'none'}`);
    });

    await api.setCapturePaused(true);
    await api.selectThread('thread-inbox');
    unsubscribe();

    expect(states).toEqual(['paused:thread-research', 'paused:thread-inbox']);
  });

  it('pins a new thread to its agent defaults', async () => {
    const api = createDemoRendererApi();
    const threadId = await api.createThread('agent-personal');
    const snapshot = await api.getSnapshot();

    expect(snapshot.activeThread).toMatchObject({
      id: threadId,
      provider: 'meta',
      model: 'Sia Meta',
      workspace: '/Users/lawrencejang/Documents',
    });
  });
});
