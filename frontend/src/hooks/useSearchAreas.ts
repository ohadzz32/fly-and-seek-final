import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchArea, IFlight } from '../types/Flight.types';
import { SearchAreaStatus } from '../types/enums';
import { createSearchArea } from '../utils/searchAreaUtils';

const ANIMATION_INTERVAL_MS = 50;

interface UseSearchAreasReturn {
  searchAreas: SearchArea[];
  animationClock: number;
  openSearchArea: (flight: IFlight, searchType: 'regular' | 'smart') => void;
  closeSearchArea: (flightId: string) => void;
  toggleSearchArea: (flight: IFlight, searchType: 'regular' | 'smart') => void;
  hasSearchArea: (flightId: string) => boolean;
  getSearchAreaStatus: (flightId: string) => SearchAreaStatus;
  clearAllSearchAreas: () => void;
}

export const useSearchAreas = (): UseSearchAreasReturn => {
  const [searchAreas, setSearchAreas] = useState<SearchArea[]>([]);
  const [animationClock, setAnimationClock] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasActiveSearchAreas = searchAreas.length > 0;

  const clearAnimationInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearAnimationInterval();

    if (hasActiveSearchAreas) {
      intervalRef.current = setInterval(() => {
        setAnimationClock(Date.now());
      }, ANIMATION_INTERVAL_MS);
    }

    return clearAnimationInterval;
  }, [hasActiveSearchAreas, clearAnimationInterval]);

  const isFlightTracked = useCallback(
    (flightId: string): boolean => searchAreas.some(area => area.originalId === flightId),
    [searchAreas]
  );

  const openSearchArea = useCallback(
    (flight: IFlight, searchType: 'regular' | 'smart' = 'regular') => {
      if (isFlightTracked(flight.flightId)) return;
      
      const newSearchArea = createSearchArea(flight, searchType);
      setSearchAreas(prev => [...prev, newSearchArea]);
    },
    [isFlightTracked]
  );

  const closeSearchArea = useCallback((flightId: string) => {
    setSearchAreas(prev => prev.filter(area => area.originalId !== flightId));
  }, []);

  const toggleSearchArea = useCallback(
    (flight: IFlight, searchType: 'regular' | 'smart' = 'regular') => {
      if (isFlightTracked(flight.flightId)) {
        closeSearchArea(flight.flightId);
      } else {
        openSearchArea(flight, searchType);
      }
    },
    [isFlightTracked, closeSearchArea, openSearchArea]
  );

  const hasSearchArea = useCallback(
    (flightId: string): boolean => isFlightTracked(flightId),
    [isFlightTracked]
  );

  const getSearchAreaStatus = useCallback(
    (flightId: string): SearchAreaStatus => {
      const area = searchAreas.find(a => a.originalId === flightId);
      if (!area) return SearchAreaStatus.NONE;
      return area.searchType === 'smart' ? SearchAreaStatus.SMART : SearchAreaStatus.REGULAR;
    },
    [searchAreas]
  );

  const clearAllSearchAreas = useCallback(() => {
    setSearchAreas([]);
  }, []);

  return {
    searchAreas,
    animationClock,
    openSearchArea,
    closeSearchArea,
    toggleSearchArea,
    hasSearchArea,
    getSearchAreaStatus,
    clearAllSearchAreas
  };
};
