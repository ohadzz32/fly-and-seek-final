import { useState, useEffect, useCallback } from 'react';
import type { RunMode } from '../types/Config.types';
import { FlightAPIService, APIError } from '../services/FlightAPIService';

interface UseSystemModeReturn {
  currentMode: RunMode;
  loading: boolean;
  error: string | null;
  changeMode: (newMode: RunMode) => Promise<void>;
}

export function useSystemMode(): UseSystemModeReturn {
  const [currentMode, setCurrentMode] = useState<RunMode>('OFFLINE');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentMode = useCallback(async () => {
    try {
      const mode = await FlightAPIService.getCurrentMode();
      setCurrentMode(mode);
    } catch (err) {
      console.error('Failed to fetch current mode:', err);
      setCurrentMode('OFFLINE');
    }
  }, []);

  const changeMode = useCallback(async (newMode: RunMode) => {
    if (newMode === currentMode || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await FlightAPIService.changeMode(newMode);
      setCurrentMode(newMode);
    } catch (err) {
      const errorMessage = err instanceof APIError 
        ? err.message 
        : 'Failed to change mode';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentMode, loading]);

  useEffect(() => {
    fetchCurrentMode();
  }, [fetchCurrentMode]);

  return {
    currentMode,
    loading,
    error,
    changeMode
  };
}
