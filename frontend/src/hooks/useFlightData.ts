/**
 * useFlightData.ts - Flight Data Management Hook
 * 
 * Fetches and manages flight data based on the current mode:
 * - REALTIME: Polls every 10 seconds
 * - SNAP: Single fetch only
 * - OFFLINE: No fetching, clears existing data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight } from '../types/Flight.types';
import { RunMode } from '../types/enums';

const POLLING_INTERVAL_MS = 10000; // 10 seconds

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

  // Clear all flight data
  const clearFlights = useCallback(() => {
    setFlights([]);
    setError(null);
    snapFetchCompletedRef.current = false;
  }, []);

  // Clear polling interval
  const clearPollingInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Fetch flights from API
  const fetchFlights = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    // SNAP mode: only fetch once
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

  // Update flight color
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

  // Effect: Manage data fetching based on mode
  useEffect(() => {
    isMountedRef.current = true;
    clearPollingInterval();

    // OFFLINE mode: clear data, no fetching
    if (isOffline) {
      clearFlights();
      return;
    }

    // Reset SNAP flag when mode changes
    if (isSnap) {
      snapFetchCompletedRef.current = false;
    }

    // Initial fetch for online modes
    fetchFlights();

    // REALTIME mode: set up polling
    if (mode === RunMode.REALTIME) {
      intervalRef.current = setInterval(fetchFlights, POLLING_INTERVAL_MS);
    }

    // Cleanup on mode change or unmount
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