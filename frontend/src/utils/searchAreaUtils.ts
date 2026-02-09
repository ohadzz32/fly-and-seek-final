import type { SearchArea, IFlight } from '../types/Flight.types';

let searchAreaDepthCounter = 1;

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
    zIndex: searchAreaDepthCounter++
  };
};

export const calculateSearchRadius = (
  searchArea: SearchArea,
  currentTime: number,
  safetyMargin: number = 1.1
): number => {
  const timeElapsedSeconds = (currentTime - searchArea.frozenAt) / 1000;
  const velocityMetersPerSecond = searchArea.velocity || 0;
  return timeElapsedSeconds * velocityMetersPerSecond * safetyMargin;
};

export const isFlightTracked = (
  flightId: string,
  searchAreas: SearchArea[]
): boolean => {
  return searchAreas.some(area => area.originalId === flightId);
};

export const getSearchAreaForFlight = (
  flightId: string,
  searchAreas: SearchArea[]
): SearchArea | undefined => {
  return searchAreas.find(area => area.originalId === flightId);
};
