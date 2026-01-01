export type RunMode = 'OFFLINE' | 'REALTIME' | 'SNAP';


export interface ModeOption {
  id: RunMode;
  label: string;
  icon: string;
  color: string;
  description?: string;
}
