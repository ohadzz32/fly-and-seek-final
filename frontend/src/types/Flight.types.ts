export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number;
  trueTrack: number;
  color: string;
  lastUpdated?: string;
  isGhost?: boolean;
  altitude?: number;
  verticalRate?: number;
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


// ─── Prediction / Smart Search types ───

export interface PredictionBufferStatus {
  bufferSize: number;
  bufferReady: boolean;
  samplesNeeded: number;
}

export interface PredictedPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  step: number;
}

export interface SmartSearchState {
  flightId: string;
  isBuffering: boolean;
  bufferProgress: number;
  isPredicting: boolean;
  predictedPosition: PredictedPosition | null;
  actualPosition: { latitude: number; longitude: number } | null;
  driftMeters: number;
  predictedPath: [number, number][];
  actualPath: [number, number][];
  totalSteps: number;
  startPosition: { latitude: number; longitude: number } | null;
}