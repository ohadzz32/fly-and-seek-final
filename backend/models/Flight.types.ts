export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  velocity: number;
  trueTrack: number;
  color: string;
  isGhost?: boolean;
  lastUpdated?: Date;
}

export interface FlightDTO {
  flightId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  velocity: number;
  trueTrack: number;
  color?: string;
}

export interface GeographicBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}
