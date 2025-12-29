import { useState, useEffect, useCallback } from 'react';
import type { IFlight } from '../types/Flight.types';
import { FlightAPIService, APIError } from '../services/FlightAPIService';

interface UseFlightDataReturn {
  flights: IFlight[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateFlightColor: (flightId: string, color: string) => Promise<void>;
}

interface UseFlightDataOptions {
  pollInterval?: number;
  enabled?: boolean;
}

export function useFlightData(
  options: UseFlightDataOptions = {}
): UseFlightDataReturn {
  const { pollInterval = 2000, enabled = true } = options;

  const [flights, setFlights] = useState<IFlight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlights = useCallback(async () => {
    try {
      setError(null);
      const data = await FlightAPIService.getFlights();
      setFlights(data);
    } catch (err) {
      const errorMessage = err instanceof APIError 
        ? err.message 
        : 'Failed to fetch flights';
      setError(errorMessage);
      console.error('Error fetching flights:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFlightColor = useCallback(async (flightId: string, color: string) => {
    try {
      await FlightAPIService.updateFlightColor(flightId, color);
      
      // Optimistically update local state
      setFlights(prevFlights => 
        prevFlights.map(flight => 
          flight.flightId === flightId 
            ? { ...flight, color } 
            : flight
        )
      );
    } catch (err) {
      const errorMessage = err instanceof APIError 
        ? err.message 
        : 'Failed to update flight color';
      setError(errorMessage);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    fetchFlights();

    const interval = setInterval(fetchFlights, pollInterval);

    return () => clearInterval(interval);
  }, [fetchFlights, pollInterval, enabled]);

  return {
    flights,
    loading,
    error,
    refetch: fetchFlights,
    updateFlightColor
  };
}
