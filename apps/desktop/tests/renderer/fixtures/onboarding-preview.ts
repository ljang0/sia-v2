// Isolated browser fixture: actual UI, synthetic voice snapshots, no native bridge or OS access.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/renderer/App';
import { createDemoRendererApi } from '../../../src/renderer/demo/api';
import { demoSnapshot } from '../../../src/renderer/demo/snapshot';
import type { OnboardingStep, PushToTalkView } from '../../../src/shared/bridge';
import type { RendererSnapshot } from '../../../src/renderer/types';

const seed = structuredClone(demoSnapshot);
seed.preferences.onboarding = { step: 'practice', agentId: seed.agents[0]!.id };
seed.computer.accessibility = 'allowed';
seed.computer.screenRecording = 'allowed';
seed.voice = {
  status: 'connected',
  voices: [],
  dictationAvailable: true,
  pushToTalk: {
    available: true,
    enabled: true,
    accessibility: true,
    microphone: true,
    phase: 'idle',
    practice: true,
  },
};
const api = createDemoRendererApi(seed);
const listeners = new Set<(snapshot: RendererSnapshot) => void>();
const publish = () => listeners.forEach((listener) => listener(structuredClone(seed)));
api.getSnapshot = async () => structuredClone(seed);
api.subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
api.setOnboarding = async (step) => {
  seed.preferences.onboarding!.step = step;
  publish();
};

declare global {
  interface Window {
    onboardingPreview: {
      step(step: OnboardingStep): void;
      voice(phase: PushToTalkView['phase'], transcript?: string): void;
    };
  }
}
window.onboardingPreview = {
  step(step) {
    seed.preferences.onboarding!.step = step;
    publish();
  },
  voice(phase, transcript) {
    seed.voice.pushToTalk!.phase = phase;
    seed.voice.pushToTalk!.practiceTranscript = transcript;
    publish();
  },
};
createRoot(document.getElementById('root')!).render(createElement(App, { api }));
