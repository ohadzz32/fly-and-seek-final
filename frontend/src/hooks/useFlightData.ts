import { useState, useEffect, useCallback, useRef } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight } from '../types/Flight.types';
import { RunMode } from '../types/enums';

const POLLING_INTERVAL_MS = 10000;

interface UseFlightDataReturn {
  flights: IFlight[];
  loading: boolean;
  error: string | null;
  updateFlightColor: (flightId: string, color: string) => Promise<void>;
  clearFlights: () => void;
}

export const useFlightData = (mode: RunMode): UseFlightDataReturn => {
  const [flights, setFlights] = useState<IFlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const snapFetchCompletedRef = useRef(false);

  const isOffline = mode === RunMode.OFFLINE;
  const isSnap = mode === RunMode.SNAP;

  const clearFlights = useCallback(() => {
    setFlights([]);
    setError(null);
    snapFetchCompletedRef.current = false;
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
        setFlights(data);
        setError(null);
        
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
      intervalRef.current = setInterval(fetchFlights, POLLING_INTERVAL_MS);
    }

    return () => {
      isMountedRef.current = false;
      clearPollingInterval();
    };
  }, [mode, isOffline, isSnap, fetchFlights, clearFlights, clearPollingInterval]);

  return {
    flights,
    loading,
    error,
    updateFlightColor,
    clearFlights
  };
};