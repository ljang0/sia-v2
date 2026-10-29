/** Test-only scenario contract. Oracles never enter an agent workspace or app observation. */
export interface LabPage {
  title: string;
  text: string;
  links?: Record<string, string>;
  fields?: Record<string, string>;
  buttons?: Record<string, { write?: string; goto?: string }>;
}
export interface LabDefinition {
  start: string;
  pages: Record<string, LabPage>;
}
export interface LabWrite {
  id: string;
  values: Record<string, string>;
}
export interface ReliabilityCase {
  id: string;
  category: string;
  title: string;
  request: string;
  app: LabDefinition;
  fields: string;
  expected: Record<string, unknown>;
  mustObserve: string[];
  files?: Record<string, string>;
  expectedFiles?: Record<string, string>;
  writes?: LabWrite[];
  memory?: { title: string; text: string }[];
  warmup?: string;
  restart?: boolean;
  attention?: boolean;
  fault?: 'stale_once' | 'noop_once' | 'lost_ack_once' | 'capture_once';
}
export interface LabState {
  current: string;
  writes: LabWrite[];
  visits: string[];
  pid: number;
}
