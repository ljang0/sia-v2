import { useEffect, useState } from 'react';
import type { ScottyApi, ScottyState, ScottyStatus } from '../../shared/scotty';
import type { ScottyPose } from './ScottySprite';
import { useTextSize } from '../textSize';
const empty: ScottyState = {
  revision: -1,
  settings: { enabled: false, size: 'medium', motion: true },
  available: false,
  status: 'idle',
  agents: [],
  tasks: [],
  workingCount: 0,
  attentionCount: 0,
  moreTasks: false,
};
export const labels: Record<ScottyStatus, string> = {
  idle: 'Here with you',
  working: 'Working',
  input: 'Needs you',
  ready: 'Ready',
  blocked: 'Needs attention',
};
export const poses: Record<ScottyStatus, ScottyPose> = {
  idle: 'idle',
  working: 'working',
  input: 'curious',
  ready: 'happy',
  blocked: 'curious',
};
export function useScotty(api: ScottyApi) {
  const [state, setState] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let received = false;
    const receive = (next: ScottyState) => {
      if (active) {
        received = true;
        setState(next);
      }
    };
    const unsubscribe = api.onState(receive);
    void api
      .state()
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {
        if (active) setError('Scotty could not connect to Sia.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);
  useTextSize(state.textSize);
  return { state, error, setError };
}
