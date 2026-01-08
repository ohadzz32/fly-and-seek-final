export interface IFlight { //DB
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  isGhost?: boolean;
  speed ?: number; //an know i need to cheak about if my data set have speed or not 
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
