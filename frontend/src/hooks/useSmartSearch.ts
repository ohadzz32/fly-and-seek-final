import { useState, useCallback, useRef, useEffect } from 'react';
import { FlightAPIService } from '../services/FlightAPIService';
import type { IFlight, SmartSearchState } from '../types/Flight.types';

export const useSmartSearch = () => {
    const [trackedFlights, setTrackedFlights] = useState<Record<string, IFlight>>({});
    const [predictions, setPredictions] = useState<Record<string, SmartSearchState['predictedPosition']>>({});
    const historyRef = useRef<Record<string, any[]>>({});
    const simulatedCountRef = useRef<Record<string, number>>({});
    const calibrationCompleteRef = useRef<Record<string, boolean>>({});

    const toggleTracking = useCallback((flight: IFlight) => {
        setTrackedFlights(prev => {
            const next = { ...prev };
            if (next[flight.flightId]) {
                // Remove
                delete next[flight.flightId];
                delete historyRef.current[flight.flightId];
                delete simulatedCountRef.current[flight.flightId];
                delete calibrationCompleteRef.current[flight.flightId];
                setPredictions(p => {
                    const nextP = { ...p };
                    delete nextP[flight.flightId];
                    return nextP;
                });
            } else {
                // Add
                next[flight.flightId] = flight;
                historyRef.current[flight.flightId] = [];
                simulatedCountRef.current[flight.flightId] = 0;
                calibrationCompleteRef.current[flight.flightId] = false;
                
                // Fetch history immediately
                FlightAPIService.getFlightHistory(flight.flightId, 30).then(history => {
                    if (history.length > 0) {
                        historyRef.current[flight.flightId] = history;
                        simulatedCountRef.current[flight.flightId] = Math.min(30, history.length);
                    }
                }).catch(() => {});
            }
            return next;
        });
    }, []);

    const isTracking = useCallback((flightId: string) => {
        return !!trackedFlights[flightId];
    }, [trackedFlights]);

    // Update existing tracked flights with new telemetry
    const updateTrackedFlights = useCallback((latestFlights: IFlight[]) => {
        setTrackedFlights(prev => {
            let changed = false;
            const next = { ...prev };
            for (const f of latestFlights) {
                if (next[f.flightId]) {
                    next[f.flightId] = f;
                    changed = true;
                    
                    const newPoint = {
                        icao24: f.flightId,
                        lat: f.latitude,
                        lon: f.longitude,
                        alt: 10000, 
                        velocity: f.velocity,
                        heading: f.trueTrack,
                        time: Date.now() / 1000,
                        vertical_rate: 0
                    };
                    
                    const hist = historyRef.current[f.flightId] || [];
                    const lastPoint = hist[hist.length - 1];
                    if (!lastPoint || lastPoint.lat !== newPoint.lat || lastPoint.lon !== newPoint.lon) {
                        historyRef.current[f.flightId] = [...hist, newPoint].slice(-50);
                        
                        if ((simulatedCountRef.current[f.flightId] || 0) < 30) {
                            simulatedCountRef.current[f.flightId] = (simulatedCountRef.current[f.flightId] || 0) + 1;
                        }
                    }
                }
            }
            return changed ? next : prev;
        });
    }, []);

    const runPredictions = useCallback(async () => {
        const currentTracked = Object.values(trackedFlights);
        if (currentTracked.length === 0) return;

        for (const target of currentTracked) {
            const flightId = target.flightId;
            const count = simulatedCountRef.current[flightId] || 0;
            const hist = historyRef.current[flightId] || [];
            
            if (count >= 30 && !calibrationCompleteRef.current[flightId]) {
                console.log('Calibration Complete');
                calibrationCompleteRef.current[flightId] = true;
            } else if (count < 30) {
                console.log(`incomplete (${count}/30)`);
            }

            const itemsToSend = Math.min(count, hist.length);
            const historyToSend = hist.slice(-Math.max(1, itemsToSend));

            if (historyToSend.length === 0) continue;

            try {
                const result = await FlightAPIService.predictSmartSearch(historyToSend);
                if (result && typeof result.lat === 'number' && typeof result.lon === 'number') {
                    setPredictions(p => ({
                        ...p,
                        [flightId]: {
                            latitude: result.lat,
                            longitude: result.lon,
                            altitude: result.alt,
                            confidence: result.confidence,
                            uncertainty_m: result.uncertainty_m
                        }
                    }));
                }
            } catch (err) {}
        }
    }, [trackedFlights]);

    useEffect(() => {
        let simInterval: NodeJS.Timeout;
        const currentTracked = Object.keys(trackedFlights);
        if (currentTracked.length > 0) {
            simInterval = setInterval(() => {
                for (const flightId of currentTracked) {
                    if ((simulatedCountRef.current[flightId] || 0) < 30 && (historyRef.current[flightId]?.length || 0) > 0) {
                        simulatedCountRef.current[flightId] += 1;
                    }
                }
            }, 10000);
        }
        return () => clearInterval(simInterval);
    }, [trackedFlights]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (Object.keys(trackedFlights).length > 0) {
            runPredictions(); 
            interval = setInterval(runPredictions, 10000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [trackedFlights, runPredictions]);

    return {
        trackedFlights,
        predictions,
        toggleTracking,
        isTracking,
        updateTrackedFlights
    };
};
