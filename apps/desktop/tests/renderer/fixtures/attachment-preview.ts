// Renderer regression fixture only; not real-work acceptance evidence.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/renderer/App';
import '../../../src/renderer/tokens.css';
import { createDemoRendererApi } from '../../../src/renderer/demo/api';
import { demoSnapshot } from '../../../src/renderer/demo/snapshot';

const seed = structuredClone(demoSnapshot);
const thread = seed.activeThread!;
thread.status = 'idle';
thread.events = [
  {
    id: 'preview-result',
    type: 'message',
    role: 'assistant',
    timestamp: new Date().toISOString(),
    content: 'Your review brief is saved.',
    attachments: [{ id: 'brief', name: 'review.md', kind: 'file', bytes: 80, generated: true }],
  },
];
const api = createDemoRendererApi(seed);
api.previewAttachment = async () => ({
  kind: 'text',
  format: 'text',
  content: '# Review brief\n\nSaved document.',
});
createRoot(document.getElementById('root')!).render(createElement(App, { api }));
