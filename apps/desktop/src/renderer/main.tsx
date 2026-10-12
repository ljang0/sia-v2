import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from './components/ErrorBoundary';

const root = document.getElementById('root');

if (!root) throw new Error('Renderer root element is missing.');

const reactRoot = createRoot(root);

if (location.hash === '#scotty' || location.hash === '#scotty-panel') {
  document.documentElement.dataset.siaSurface = location.hash.slice(1);
  void import('./components/Scotty').then(({ ScottyPet, ScottyPanel }) => {
    reactRoot.render(
      <StrictMode>{location.hash === '#scotty' ? <ScottyPet /> : <ScottyPanel />}</StrictMode>,
    );
  });
} else if (location.hash === '#launcher') {
  void import('./components/CommandLauncher').then(({ CommandLauncher }) => {
    reactRoot.render(
      <StrictMode>
        <CommandLauncher />
      </StrictMode>,
    );
  });
} else if (import.meta.env.DEV && location.hash === '#demo') {
  void Promise.all([import('./App'), import('./demo/api'), import('./demo/snapshot')]).then(
    ([{ default: App }, { createDemoRendererApi }, { demoSetupSnapshot, demoSnapshot }]) => {
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
    },
  );
} else {
  // Each window loads only its own surface, so the small companion windows do not parse the app.
  void Promise.all([import('./App'), import('./useAppController')]).then(
    ([{ default: App }, { resolveApi }]) => {
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
    },
  );
}
