import { useState, useEffect, useCallback, useRef } from 'react';
import { PredictionService } from '../services/PredictionService';
import type { IFlight, SmartSearchState } from '../types/Flight.types';

const PREDICTION_STEP_INTERVAL_MS = 1000;   // 1 prediction step per second
const HEALTH_CHECK_INTERVAL_MS = 5000;       // re-check server every 5 s
const BUFFER_FEED_INTERVAL_MS = 10000;       // feed one sample every 10 s

/** Haversine distance (metres) between two lat/lon points. */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface UsePredictionReturn {
  smartSearch: SmartSearchState | null;
  isServerOnline: boolean;
  startSmartSearch: (flight: IFlight) => void;
  activatePrediction: () => Promise<void>;
  stopPrediction: () => Promise<void>;
  cancelSmartSearch: () => Promise<void>;
}

export const usePrediction = (flights: IFlight[]): UsePredictionReturn => {
  const [smartSearch, setSmartSearch] = useState<SmartSearchState | null>(null);
  const [isServerOnline, setIsServerOnline] = useState(false);

  const predictionLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferFeederRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const trackedFlightIdRef = useRef<string | null>(null);
  const flightsRef = useRef<IFlight[]>(flights);

  // Keep flights ref in sync so the feeder always reads latest data
  flightsRef.current = flights;

  // ── Periodic health check — retries every 5 s ──
  useEffect(() => {
    isMountedRef.current = true;

    const check = () => {
      PredictionService.healthCheck().then(ok => {
        if (isMountedRef.current) setIsServerOnline(ok);
      });
    };

    check(); // immediate first check
    healthCheckRef.current = setInterval(check, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, []);

  // ── Active buffer feeder — runs its own 10 s interval while buffering ──
  useEffect(() => {
    // Cleanup if not buffering
    if (!smartSearch?.isBuffering) {
      if (bufferFeederRef.current) {
        clearInterval(bufferFeederRef.current);
        bufferFeederRef.current = null;
      }
      return;
    }

    const fid = smartSearch.flightId;

    const feed = () => {
      const flight = flightsRef.current.find(f => f.flightId === fid);
      if (!flight) return;

      const now = Date.now() / 1000;

      PredictionService.feedObservation({
        flightId: flight.flightId,
        latitude: flight.latitude,
        longitude: flight.longitude,
        altitude: flight.altitude ?? 10000,
        velocity: flight.velocity,
        heading: flight.trueTrack,
        verticalRate: flight.verticalRate ?? 0,
        timestamp: now,
      })
        .then(status => {
          if (!isMountedRef.current) return;
          setSmartSearch(prev => {
            if (!prev || prev.flightId !== fid) return prev;
            return {
              ...prev,
              bufferProgress: status.bufferSize,
              isBuffering: !status.bufferReady,
            };
          });
        })
        .catch(() => {
          // Feed failed (server down) — will retry next interval
        });
    };

    // Feed immediately on start
    feed();

    // Then every 10 seconds
    bufferFeederRef.current = setInterval(feed, BUFFER_FEED_INTERVAL_MS);

    return () => {
      if (bufferFeederRef.current) {
        clearInterval(bufferFeederRef.current);
        bufferFeederRef.current = null;
      }
    };
  }, [smartSearch?.isBuffering, smartSearch?.flightId]);

  // ── Update actual position from live flights during prediction ──
  useEffect(() => {
    if (!smartSearch?.isPredicting) return;
    const flight = flights.find(f => f.flightId === smartSearch.flightId);
    if (!flight) return;

    setSmartSearch(prev => {
      if (!prev) return prev;
      const actualPos = { latitude: flight.latitude, longitude: flight.longitude };

      const actualPath: [number, number][] = [
        ...prev.actualPath,
        [flight.longitude, flight.latitude],
      ];

      let drift = prev.driftMeters;
      if (prev.predictedPosition) {
        drift = haversineDistance(
          flight.latitude, flight.longitude,
          prev.predictedPosition.latitude, prev.predictedPosition.longitude
        );
      }

      return { ...prev, actualPosition: actualPos, actualPath, driftMeters: drift };
    });
  }, [flights, smartSearch?.isPredicting, smartSearch?.flightId]);

  // ── Cleanup all intervals on unmount ──
  useEffect(() => {
    return () => {
      if (predictionLoopRef.current) clearInterval(predictionLoopRef.current);
      if (bufferFeederRef.current) clearInterval(bufferFeederRef.current);
    };
  }, []);

  // ─────────────────────── PUBLIC API ───────────────────────

  const startSmartSearch = useCallback((flight: IFlight) => {
    // Clean up any existing prediction loop
    if (predictionLoopRef.current) {
      clearInterval(predictionLoopRef.current);
      predictionLoopRef.current = null;
    }

    trackedFlightIdRef.current = flight.flightId;

    setSmartSearch({
      flightId: flight.flightId,
      isBuffering: true,
      bufferProgress: 0,
      isPredicting: false,
      predictedPosition: null,
      actualPosition: { latitude: flight.latitude, longitude: flight.longitude },
      driftMeters: 0,
      predictedPath: [],
      actualPath: [[flight.longitude, flight.latitude]],
      totalSteps: 0,
      startPosition: { latitude: flight.latitude, longitude: flight.longitude },
    });

    // Reset any previous server-side state for this flight
    PredictionService.resetBuffer(flight.flightId).catch(() => {});
  }, []);

  const activatePrediction = useCallback(async () => {
    if (!smartSearch) return;
    const fid = smartSearch.flightId;

    try {
      const result = await PredictionService.startPrediction(fid);

      if (!isMountedRef.current) return;

      setSmartSearch(prev => prev ? {
        ...prev,
        isPredicting: true,
        isBuffering: false,
        startPosition: { latitude: result.latitude, longitude: result.longitude },
        predictedPosition: {
          latitude: result.latitude,
          longitude: result.longitude,
          altitude: result.altitude,
          step: 0,
        },
        predictedPath: [[result.longitude, result.latitude]],
      } : prev);

      // Start the recursive prediction loop
      if (predictionLoopRef.current) clearInterval(predictionLoopRef.current);

      predictionLoopRef.current = setInterval(async () => {
        try {
          const step = await PredictionService.predictStep(fid);
          if (!isMountedRef.current) return;

          setSmartSearch(prev => {
            if (!prev || !prev.isPredicting) return prev;

            const newPredPath: [number, number][] = [
              ...prev.predictedPath,
              [step.longitude, step.latitude],
            ];

            let drift = prev.driftMeters;
            if (prev.actualPosition) {
              drift = haversineDistance(
                prev.actualPosition.latitude, prev.actualPosition.longitude,
                step.latitude, step.longitude
              );
            }

            return {
              ...prev,
              predictedPosition: step,
              predictedPath: newPredPath,
              totalSteps: step.step,
              driftMeters: drift,
            };
          });
        } catch {
          // Single step failure is non-fatal
        }
      }, PREDICTION_STEP_INTERVAL_MS);

    } catch (err) {
      console.error('Failed to start prediction:', err);
    }
  }, [smartSearch]);

  const stopPrediction = useCallback(async () => {
    if (!smartSearch) return;
    const fid = smartSearch.flightId;

    if (predictionLoopRef.current) {
      clearInterval(predictionLoopRef.current);
      predictionLoopRef.current = null;
    }

    try {
      await PredictionService.stopPrediction(fid);
    } catch { /* ignore */ }

    setSmartSearch(prev => prev ? { ...prev, isPredicting: false } : prev);
  }, [smartSearch]);

  const cancelSmartSearch = useCallback(async () => {
    if (predictionLoopRef.current) {
      clearInterval(predictionLoopRef.current);
      predictionLoopRef.current = null;
    }
    if (bufferFeederRef.current) {
      clearInterval(bufferFeederRef.current);
      bufferFeederRef.current = null;
    }

    if (smartSearch) {
      try {
        await PredictionService.resetBuffer(smartSearch.flightId);
      } catch { /* ignore */ }
    }

    trackedFlightIdRef.current = null;
    setSmartSearch(null);
  }, [smartSearch]);

  return {
    smartSearch,
    isServerOnline,
    startSmartSearch,
    activatePrediction,
    stopPrediction,
    cancelSmartSearch,
  };
};
