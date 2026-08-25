import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');

if (!root) throw new Error('Renderer root element is missing.');

const reactRoot = createRoot(root);

if (import.meta.env.DEV && location.hash === '#demo') {
  void import('./demo').then(({ createDemoRendererApi, demoSnapshot }) => {
    reactRoot.render(
      <StrictMode>
        <App api={createDemoRendererApi(structuredClone(demoSnapshot))} />
      </StrictMode>,
    );
  });
} else {
  reactRoot.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
