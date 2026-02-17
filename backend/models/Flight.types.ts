export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  isGhost?: boolean;
  lastUpdated?: Date;
  altitude?: number;
  verticalRate?: number;
}

export interface FlightDTO {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color?: string;
  altitude?: number;
  verticalRate?: number;
}

export interface GeographicBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}
