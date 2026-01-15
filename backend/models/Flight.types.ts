export interface IFlight { //DB
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  isGhost?: boolean;
  lastUpdated?: Date;
}


export interface FlightDTO { //api
  flightId: string;
  latitude: number;
  longitude: number;
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
