import { useState, useEffect } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight } from '../types/Flight.types';

export const useFlightData = () => {
  const [flights, setFlights] = useState<IFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlights = async () => {
    try {
      const data = await FlightAPIService.getFlights();
      setFlights(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch flights');
    } finally {
      setLoading(false);
    }
  };

  const updateFlightColor = async (flightId: string, color: string) => {
    try {
      await FlightAPIService.updateFlightColor(flightId, color);
      setFlights(prev => 
        prev.map(f => f.flightId === flightId ? { ...f, color } : f)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update color');
    }
  };

  const toggleGhostMode = async (flightId: string) => {
    try {
      await FlightAPIService.toggleGhostStatus(flightId);
      await fetchFlights(); 
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle ghost mode');
    }
  };

  useEffect(() => {
    fetchFlights();
    const interval = setInterval(fetchFlights, 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    flights,
    loading,
    error,
    updateFlightColor,
    toggleGhostMode
  };
};