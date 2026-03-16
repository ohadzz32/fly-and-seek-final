export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  lastUpdated?: string;
  isGhost?: boolean;
}

export interface SearchArea extends IFlight {
  originalId: string;
  frozenAt: number;
  searchType: 'regular' | 'smart';
  zIndex?: number;
}

export interface StaticGhost extends SearchArea {}


export interface ColorOption {
  name: string;
  hex: string;
}


export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}


export interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  visible: boolean;
  aircraftId: string | null;
}