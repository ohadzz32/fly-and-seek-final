export type RunMode = 'OFFLINE' | 'SNAP' | 'REALTIME';


export interface IFlightService {
  readonly mode: RunMode;
  start(): Promise<void>;
  stop(): void;
}