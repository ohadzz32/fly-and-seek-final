import type { SearchArea, IFlight } from '../types/Flight.types';

// Global counter for Z-Index. Defined outside functions so it persists for the session.
// This ensures every new SearchArea gets a higher layer than the previous ones.
let searchAreaDepthCounter = 1;

/**
 * Creates a new SearchArea from a flight with a unique zIndex to prevent Z-Fighting.
 * @param flight The original flight object
 * @param searchType The type of search (regular/smart)
 */
export const createSearchArea = (
  flight: IFlight,
  searchType: 'regular' | 'smart'
): SearchArea => {
  return {
    ...flight,
    originalId: flight.flightId,
    frozenAt: Date.now(),
    searchType,
    isGhost: true,
    // Assign unique zIndex and increment the global counter
    zIndex: searchAreaDepthCounter++
  };
};

/**
 * מחשב את רדיוס אזור החיפוש על סמך הזמן שחלף ומהירות המטוס
 * @param searchArea - אזור החיפוש
 * @param currentTime - זמן נוכחי במילישניות
 * @param safetyMargin - מקדם בטיחות (ברירת מחדל: 1.1 = +10%)
 * @returns רדיוס אזור החיפוש במטרים
 */
export const calculateSearchRadius = (
  searchArea: SearchArea,
  currentTime: number,
  safetyMargin: number = 1.1
): number => {
  const timeElapsedSeconds = (currentTime - searchArea.frozenAt) / 1000;
  // Velocity is already in m/s from backend (OpenSky API standard)
  const velocityMetersPerSecond = searchArea.velocity || 0;
  return timeElapsedSeconds * velocityMetersPerSecond * safetyMargin;
};

/**
 * בודק האם מטוס מסוים נמצא באזור חיפוש פעיל
 * @param flightId - מזהה המטוס
 * @param searchAreas - מערך אזורי חיפוש פעילים
 * @returns true אם המטוס מעוקב
 */
export const isFlightTracked = (
  flightId: string,
  searchAreas: SearchArea[]
): boolean => {
  return searchAreas.some(area => area.originalId === flightId);
};

/**
 * מחזיר את אזור החיפוש של מטוס מסוים
 * @param flightId - מזהה המטוס
 * @param searchAreas - מערך אזורי חיפוש
 * @returns אזור החיפוש או undefined
 */
export const getSearchAreaForFlight = (
  flightId: string,
  searchAreas: SearchArea[]
): SearchArea | undefined => {
  return searchAreas.find(area => area.originalId === flightId);
};
