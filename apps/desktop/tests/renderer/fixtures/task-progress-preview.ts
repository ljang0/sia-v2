// Browser-only fixture: synthetic task state, no Electron bridge, accounts or native input.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/renderer/App';
import '../../../src/renderer/tokens.css';
import { createDemoRendererApi } from '../../../src/renderer/demo/api';
import { demoSnapshot } from '../../../src/renderer/demo/snapshot';
import type { ActivityEvent, RendererSnapshot } from '../../../src/renderer/types';

const seed = structuredClone(demoSnapshot);
const thread = seed.activeThread!;
thread.status = 'running';
const timestamp = new Date().toISOString();
const step = (id: string): ActivityEvent => ({
  id,
  type: 'activity',
  kind: 'command',
  title: 'fixture-command --private-detail',
  status: 'complete',
  timestamp,
  presentation: { kind: 'command', command: 'fixture-command --private-detail' },
});
thread.events = [
  {
    id: 'request',
    type: 'message',
    role: 'user',
    content: 'Check all my course pages and gather this week’s assignments.',
    timestamp,
  },
  {
    id: 'progress',
    type: 'message',
    role: 'assistant',
    content: 'I’m checking each course page and verifying the due dates.',
    streaming: false,
    timestamp,
  },
  ...Array.from({ length: 5 }, (_, i) => step(`earlier-${i}`)),
  {
    id: 'current',
    type: 'activity',
    kind: 'browser',
    toolName: 'browser_snapshot',
    title: 'Read the course page',
    status: 'running',
    timestamp,
  },
];
const listeners = new Set<(snapshot: RendererSnapshot) => void>();
const summary = seed.agents
  .flatMap((agent) => agent.threads)
  .find(({ id }) => id === thread.id);
if (summary) summary.status = thread.status;
const publish = () => {
  if (summary) summary.status = thread.status;
  listeners.forEach((listener) => listener(structuredClone(seed)));
};
const api = createDemoRendererApi(seed);
api.getSnapshot = async () => structuredClone(seed);
api.subscribe = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
declare global {
  interface Window {
    taskProgressPreview: { advance(): void; finish(): void };
  }
}
window.taskProgressPreview = {
  advance() {
    for (const event of thread.events) if (event.type === 'activity') event.status = 'complete';
    thread.events.push({
      id: 'next',
      type: 'activity',
      kind: 'computer',
      toolName: 'computer_snapshot',
      title: 'Check another course',
      status: 'running',
      timestamp,
    });
    publish();
  },
  finish() {
    for (const event of thread.events) if (event.type === 'activity') event.status = 'complete';
    thread.status = 'idle';
    thread.events.push({
      id: 'result',
      type: 'message',
      role: 'assistant',
      content: 'Checked each course page and verified the assignment dates.',
      streaming: false,
      timestamp,
    });
    publish();
  },
};
createRoot(document.getElementById('root')!).render(createElement(App, { api }));
