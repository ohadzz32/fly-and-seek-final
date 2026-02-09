import { useState, useEffect, useCallback, useMemo } from 'react';
import { RunMode } from '../types/enums';
import { FlightAPIService, APIError } from '../services/FlightAPIService';

interface UseSystemModeReturn {
  currentMode: RunMode;
  loading: boolean;
  error: string | null;
  changeMode: (newMode: RunMode) => Promise<void>;
}

export function useSystemMode(): UseSystemModeReturn {
  const [currentMode, setCurrentMode] = useState<RunMode>(RunMode.OFFLINE);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentMode = useCallback(async () => {
    try {
      console.log('[useSystemMode] 🔄 Fetching current mode...');
      const modeString = await FlightAPIService.getCurrentMode();
      const mode = modeString as RunMode;
      console.log(`[useSystemMode] ✅ Current mode: ${mode}`);
      setCurrentMode(mode);
    } catch (err) {
      console.error('[useSystemMode] ❌ Failed to fetch current mode:', err);
      setCurrentMode(RunMode.OFFLINE);
    }
  }, []);

  const changeMode = useCallback(async (newMode: RunMode) => {
    console.log(`[useSystemMode] 🔄 Changing mode from ${currentMode} to ${newMode}`);
    if (newMode === currentMode || loading) {
      console.log('[useSystemMode] ⏸️ Skipping - same mode or loading');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await FlightAPIService.changeMode(newMode);
      console.log(`[useSystemMode] ✅ Mode changed successfully to ${newMode}`);
      setCurrentMode(newMode);
    } catch (err) {
      console.error('[useSystemMode] ❌ Error changing mode:', err);
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

  return useMemo(() => ({
    currentMode,
    loading,
    error,
    changeMode
  }), [currentMode, loading, error, changeMode]);
}
