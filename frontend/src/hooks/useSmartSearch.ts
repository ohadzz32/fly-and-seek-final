import { useState, useCallback, useRef, useEffect } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight, SmartSearchState } from '../types/Flight.types';

export const useSmartSearch = (selectedFlight: IFlight | null) => {
    const [isActive, setIsActive] = useState(false);
    const [trackedFlight, setTrackedFlight] = useState<IFlight | null>(null);
    const [prediction, setPrediction] = useState<SmartSearchState['predictedPosition']>(null);
    const [error, setError] = useState<string | null>(null);
    const historyRef = useRef<any[]>([]);

    // Lock the flight when activated
    useEffect(() => {
        if (isActive && selectedFlight && !trackedFlight) {
            console.log(`[useSmartSearch] 🔒 Locking flight: ${selectedFlight.flightId}`);
            setTrackedFlight(selectedFlight);
        }
    }, [isActive, selectedFlight, trackedFlight]);

    const runPrediction = useCallback(async () => {
        const target = trackedFlight || selectedFlight;
        if (!target) return;

        console.log(`[useSmartSearch] 🚀 runPrediction triggered. History length: ${historyRef.current.length}`);
        
        if (historyRef.current.length < 30) {
            console.warn(`[useSmartSearch] ⚠️ History too short: ${historyRef.current.length}/30 points`);
            return;
        }

        try {
            const historyToSend = historyRef.current.slice(-30);
            console.log('[useSmartSearch] 📡 Sending prediction request to backend...', historyToSend);
            const result = await FlightAPIService.predictSmartSearch(historyToSend);
            console.log('[useSmartSearch] ✅ Raw Result from API:', result);
            
            if (result && typeof result.lat === 'number' && typeof result.lon === 'number') {
                const newPrediction = {
                    latitude: result.lat,
                    longitude: result.lon,
                    altitude: result.alt,
                    confidence: result.confidence,
                    uncertainty_m: result.uncertainty_m
                };
                console.log('[useSmartSearch] 📍 Setting prediction state:', newPrediction);
                setPrediction(newPrediction);
                setError(null);
            } else {
                console.error('[useSmartSearch] ❌ Invalid prediction result format:', result);
                setError('Invalid prediction format from server');
            }
        } catch (err: any) {
            console.error('[useSmartSearch] ❌ Prediction error:', err);
            setError(err.message);
        }
    }, [trackedFlight, selectedFlight]);

    // Fetch historical data immediately upon activation
    useEffect(() => {
        const target = trackedFlight || selectedFlight;
        if (isActive && target) {
            const fetchHistory = async () => {
                try {
                    console.log(`[useSmartSearch] 📜 Fetching historical data for ${target.flightId}`);
                    const history = await FlightAPIService.getFlightHistory(target.flightId, 30);
                    
                    if (history.length > 0) {
                        historyRef.current = history;
                        console.log(`[useSmartSearch] ✅ History seeded with ${history.length} points`);
                        
                        if (history.length >= 30) {
                            runPrediction();
                        }
                    }
                } catch (err) {
                    console.error('[useSmartSearch] ❌ Failed to fetch history:', err);
                }
            };
            
            fetchHistory();
        }
    }, [isActive, trackedFlight, selectedFlight, runPrediction]);

    // Accumulate history points as the flight data updates
    useEffect(() => {
        const target = trackedFlight || selectedFlight;
        if (target && isActive) {
            const newPoint = {
                lat: target.latitude,
                lon: target.longitude,
                alt: 10000, 
                velocity: target.velocity,
                heading: target.trueTrack,
                time: Date.now() / 1000,
                vertical_rate: 0
            };
            
            const lastPoint = historyRef.current[historyRef.current.length - 1];
            if (!lastPoint || 
                lastPoint.lat !== newPoint.lat || 
                lastPoint.lon !== newPoint.lon) {
                
                historyRef.current = [...historyRef.current, newPoint].slice(-50);
                console.log(`[useSmartSearch] 📍 Added point to history. Count: ${historyRef.current.length}/30`);
            }
        }
    }, [trackedFlight, selectedFlight, isActive]);

    // Reset history when the feature is turned OFF
    useEffect(() => {
        if (!isActive) {
            console.log('[useSmartSearch] 🧹 Resetting history');
            historyRef.current = [];
            setPrediction(null);
            setError(null);
            setTrackedFlight(null);
        }
    }, [isActive]);

    // Periodically run prediction when active
    useEffect(() => {
        let interval: NodeJS.Timeout;
        const target = trackedFlight || selectedFlight;
        if (isActive && target) {
            runPrediction(); 
            interval = setInterval(runPrediction, 3000); 
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isActive, trackedFlight, selectedFlight, runPrediction]);

    return {
        isActive,
        setIsActive,
        prediction,
        error,
        history: historyRef.current,
        trackedFlight
    };
};
