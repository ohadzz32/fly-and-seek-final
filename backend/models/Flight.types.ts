/**
 * Flight document interface - represents stored data in MongoDB
 */
export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;      // m/s
  trueTrack: number;     // degrees (0-360)
  color: string;         // hex color
  isGhost?: boolean;     // frozen for search area
  lastUpdated?: Date;
}

/**
 * Flight Data Transfer Object - used for API responses
 */
export interface FlightDTO {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color?: string;
}

/**
 * Geographic bounding box for filtering flights by region
 */
export interface GeographicBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}
