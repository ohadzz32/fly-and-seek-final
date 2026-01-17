/**
 * ייצוג מטוס בזמן אמת
 */
export interface IFlight {
  flightId: string;
  latitude: number;
  longitude: number;
  velocity: number; // מהירות במטרים/שנייה (m/s)
  trueTrack: number; // כיוון בדרגות (0-360)
  color: string; // צבע המטוס בפורמט HEX
  lastUpdated?: string;
  isGhost?: boolean; // האם זה טראק רפאים
}

/**
 * ייצוג מטוס קפוא עם אזור חיפוש
 * מייצג את המטוס בזמן הקיפאון
 */
export interface SearchArea extends IFlight {
  originalId: string; // מזהה המטוס המקורי
  frozenAt: number; // זמן הקיפאון במילישניות (Date.now())
  searchType: 'regular' | 'smart'; // סוג אזור החיפוש
  zIndex?: number; // מיקום הרדיוס מבחינת הגובהה שלו בפונקצאית הרפאים
}

/**
 * @deprecated השתמש ב-SearchArea במקום
 */
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