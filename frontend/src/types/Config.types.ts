import { RunMode } from './enums';

export { RunMode };

export interface ModeOption {
  id: RunMode;
  label: string;
  icon: string;
  color: string;
  description?: string;
}
