/**
 * useSearchAreas.ts - Search Area Management Hook
 * 
 * Manages ghost mode search areas with animation clock for expanding circles.
 * The animation clock only runs when there are active search areas to prevent unnecessary renders.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchArea, IFlight } from '../types/Flight.types';
import { SearchAreaStatus } from '../types/enums';
import { createSearchArea } from '../utils/searchAreaUtils';

const ANIMATION_INTERVAL_MS = 50; // 20 FPS - smooth enough for expanding circles

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

  // Cleanup interval helper
  const clearAnimationInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start/stop animation based on active search areas
  useEffect(() => {
    clearAnimationInterval();

    if (hasActiveSearchAreas) {
      intervalRef.current = setInterval(() => {
        setAnimationClock(Date.now());
      }, ANIMATION_INTERVAL_MS);
    }

    return clearAnimationInterval;
  }, [hasActiveSearchAreas, clearAnimationInterval]);

  // Check if flight is being tracked
  const isFlightTracked = useCallback(
    (flightId: string): boolean => searchAreas.some(area => area.originalId === flightId),
    [searchAreas]
  );

  // Open new search area
  const openSearchArea = useCallback(
    (flight: IFlight, searchType: 'regular' | 'smart' = 'regular') => {
      if (isFlightTracked(flight.flightId)) return;
      
      const newSearchArea = createSearchArea(flight, searchType);
      setSearchAreas(prev => [...prev, newSearchArea]);
    },
    [isFlightTracked]
  );

  // Close search area
  const closeSearchArea = useCallback((flightId: string) => {
    setSearchAreas(prev => prev.filter(area => area.originalId !== flightId));
  }, []);

  // Toggle search area
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

  // Check if flight has search area
  const hasSearchArea = useCallback(
    (flightId: string): boolean => isFlightTracked(flightId),
    [isFlightTracked]
  );

  // Get search area status
  const getSearchAreaStatus = useCallback(
    (flightId: string): SearchAreaStatus => {
      const area = searchAreas.find(a => a.originalId === flightId);
      if (!area) return SearchAreaStatus.NONE;
      return area.searchType === 'smart' ? SearchAreaStatus.SMART : SearchAreaStatus.REGULAR;
    },
    [searchAreas]
  );

  // Clear all search areas
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
