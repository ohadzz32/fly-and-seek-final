/**
 * Valid system run modes
 */
export const RUN_MODES = ['OFFLINE', 'SNAP', 'REALTIME'] as const;
export type RunMode = typeof RUN_MODES[number];

/**
 * Check if a string is a valid RunMode
 */
export function isValidRunMode(mode: string): mode is RunMode {
  return RUN_MODES.includes(mode as RunMode);
}

/**
 * Interface for flight services
 * Each service handles a specific mode of operation
 */
export interface IFlightService {
  readonly mode: RunMode;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): boolean;
}