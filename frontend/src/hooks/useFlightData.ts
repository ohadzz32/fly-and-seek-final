import { useState, useEffect, useCallback, useRef } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight } from '../types/Flight.types';
import { RunMode } from '../types/enums';

const POLLING_INTERVAL_MS = 12000;
const BACKGROUND_POLLING_INTERVAL_MS = 12000;

interface UseFlightDataReturn {
  flights: IFlight[];
  loading: boolean;
  error: string | null;
  noData: boolean;
  updateFlightColor: (flightId: string, color: string) => Promise<void>;
  clearFlights: () => void;
}

export const useFlightData = (mode: RunMode): UseFlightDataReturn => {
  const [flights, setFlights] = useState<IFlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackground, setIsBackground] = useState(document.visibilityState === 'hidden');
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const snapFetchCompletedRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const isOffline = mode === RunMode.OFFLINE;
  const isSnap = mode === RunMode.SNAP;

  // Handle visibility change to throttle polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBackground(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const clearFlights = useCallback(() => {
    setFlights([]);
    setError(null);
    snapFetchCompletedRef.current = false;
    hasFetchedRef.current = false;
  }, []);

  const clearPollingInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchFlights = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    if (isSnap && snapFetchCompletedRef.current) return;

    try {
      setLoading(true);
      const data = await FlightAPIService.getFlights();
      
      if (isMountedRef.current) {
        const normalizedFlights = data.filter(flight => 
          Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude)
        );

        setFlights(prev => {
          // Merge incoming data with current local state to preserve "sticky" custom colors
          // and prevent flickering or overwrites during periodic polling cycles.
          return normalizedFlights.map(newFlight => {
            const existing = prev.find(f => f.flightId === newFlight.flightId);
            return {
              ...newFlight,
              // Prioritize local state color if it exists, otherwise use incoming data
              color: existing?.color || newFlight.color
            };
          });
        });
        setError(null);
        hasFetchedRef.current = true;
        
        if (isSnap) {
          snapFetchCompletedRef.current = true;
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch flights';
        setError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isSnap]);

  const updateFlightColor = useCallback(async (flightId: string, color: string) => {
    try {
      await FlightAPIService.updateFlightColor(flightId, color);
      setFlights(prev => 
        prev.map(f => f.flightId === flightId ? { ...f, color } : f)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update color';
      setError(message);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    clearPollingInterval();

    if (isOffline) {
      clearFlights();
      return;
    }

    if (isSnap) {
      snapFetchCompletedRef.current = false;
    }

    fetchFlights();

    if (mode === RunMode.REALTIME) {
      const interval = isBackground ? BACKGROUND_POLLING_INTERVAL_MS : POLLING_INTERVAL_MS;
      intervalRef.current = setInterval(fetchFlights, interval);
    }

    return () => {
      isMountedRef.current = false;
      clearPollingInterval();
    };
  }, [mode, isOffline, isSnap, isBackground, fetchFlights, clearFlights, clearPollingInterval]);

  return {
    flights,
    loading,
    error,
    noData: !!error,
    updateFlightColor,
    clearFlights
  };
};