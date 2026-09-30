import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { resolveApi } from './useAppController';
import { ScottyPet, ScottyPanel } from './components/Scotty';
import { CommandLauncher } from './components/CommandLauncher';

const root = document.getElementById('root');

if (!root) throw new Error('Renderer root element is missing.');

const reactRoot = createRoot(root);

if (location.hash === '#scotty' || location.hash === '#scotty-panel') {
  document.documentElement.dataset.siaSurface = location.hash.slice(1);
  reactRoot.render(
    <StrictMode>{location.hash === '#scotty' ? <ScottyPet /> : <ScottyPanel />}</StrictMode>,
  );
} else if (location.hash === '#launcher') {
  reactRoot.render(
    <StrictMode>
      <CommandLauncher />
    </StrictMode>,
  );
} else if (import.meta.env.DEV && location.hash === '#demo') {
  void import('./demo').then(({ createDemoRendererApi, demoSetupSnapshot, demoSnapshot }) => {
    const api = createDemoRendererApi(
      new URLSearchParams(location.search).has('setup')
        ? demoSetupSnapshot(new URLSearchParams(location.search).get('setup'))
        : structuredClone(demoSnapshot),
    );
    const loadDelay = Math.min(
      5000,
      Math.max(0, Number(new URLSearchParams(location.search).get('startup-delay')) || 0),
    );
    if (loadDelay) {
      const snapshot = api.getSnapshot;
      api.getSnapshot = async () => {
        await new Promise((resolve) => window.setTimeout(resolve, loadDelay));
        return snapshot();
      };
    }
    reactRoot.render(
      <StrictMode>
        <AppErrorBoundary
          onSendFeedback={(message, diagnostics) =>
            api.composeFeedback(message, undefined, diagnostics)
          }
        >
          <App api={api} />
        </AppErrorBoundary>
      </StrictMode>,
    );
  });
} else {
  // One bridge instance serves the app and its crash screen's feedback draft.
  const api = resolveApi();
  reactRoot.render(
    <StrictMode>
      <AppErrorBoundary
        onSendFeedback={(message, diagnostics) =>
          api.composeFeedback(message, undefined, diagnostics)
        }
      >
        <App api={api} />
      </AppErrorBoundary>
    </StrictMode>,
  );
}
