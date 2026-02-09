export const RUN_MODES = ['OFFLINE', 'SNAP', 'REALTIME'] as const;
export type RunMode = typeof RUN_MODES[number];

export function isValidRunMode(mode: string): mode is RunMode {
  return RUN_MODES.includes(mode as RunMode);
}

export interface IFlightService {
  readonly mode: RunMode;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): boolean;
}