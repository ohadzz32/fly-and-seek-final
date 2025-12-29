/**
 * Type Definitions for Flight Domain
 * Shared types between frontend components
 */

/**
 * Flight data structure matching backend model
 */
export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  lastUpdated?: string;
}

/**
 * Color option for UI
 */
export interface ColorOption {
  name: string;
  hex: string;
}

/**
 * View state for map
 */
export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
