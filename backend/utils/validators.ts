import { RunMode, RUN_MODES, isValidRunMode } from '../services/FlightService.types';
import { ValidationError } from './errors';

/** Regex for validating hex color format (6 or 8 chars) */
const HEX_COLOR_REGEX = /^#[0-9A-F]{6}([0-9A-F]{2})?$/i;

/**
 * Validates hex color format
 * Accepts both 6-char (#FFFFFF) and 8-char (#FFFFFFFF) formats
 */
export function validateHexColor(color: string): void {
  if (!HEX_COLOR_REGEX.test(color)) {
    throw new ValidationError(`Invalid hex color format: ${color}. Use #RRGGBB or #RRGGBBAA`);
  }
}

/**
 * Validates that the mode is a valid RunMode
 */
export function validateRunMode(mode: string): asserts mode is RunMode {
  if (!isValidRunMode(mode)) {
    throw new ValidationError(`Invalid mode: ${mode}. Must be one of: ${RUN_MODES.join(', ')}`);
  }
}


export function validateFlightId(flightId: string): void {
  if (!flightId || typeof flightId !== 'string' || flightId.trim().length === 0) {
    throw new ValidationError('Flight ID must be a non-empty string');
  }
}


export function validateCoordinates(latitude: number, longitude: number): void {
  if (latitude < -90 || latitude > 90) {
    throw new ValidationError(`Invalid latitude: ${latitude}. Must be between -90 and 90`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new ValidationError(`Invalid longitude: ${longitude}. Must be between -180 and 180`);
  }
}
