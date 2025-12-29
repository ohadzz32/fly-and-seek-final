/**
 * Type Definitions for System Configuration
 */

/**
 * System operation modes
 */
export type RunMode = 'OFFLINE' | 'REALTIME' | 'SNAP';

/**
 * Mode configuration with UI metadata
 */
export interface ModeOption {
  id: RunMode;
  label: string;
  icon: string;
  color: string;
  description?: string;
}
