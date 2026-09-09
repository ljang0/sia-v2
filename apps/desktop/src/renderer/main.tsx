import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CommandLauncher } from './components/CommandLauncher';

const root = document.getElementById('root');

if (!root) throw new Error('Renderer root element is missing.');

const reactRoot = createRoot(root);

if (location.hash === '#launcher') {
  reactRoot.render(
    <StrictMode>
      <CommandLauncher />
    </StrictMode>,
  );
} else if (import.meta.env.DEV && location.hash === '#demo') {
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
