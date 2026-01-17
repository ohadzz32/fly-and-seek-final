import { useState, useEffect, useRef, useCallback } from 'react';

interface BirdFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    species?: string;
    [key: string]: unknown;
  };
}

export interface BirdData {
  longitude: number;
  latitude: number;
  name?: string;
  species?: string;
}

interface UseBirdDataReturn {
  birds: BirdData[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing bird data
 * - Only loads data when enabled (OFFLINE mode)
 * - CRITICAL: Clears data immediately when disabled
 */
export function useBirdData(enabled: boolean): UseBirdDataReturn {
  const [birds, setBirds] = useState<BirdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const clearBirds = useCallback(() => {
    console.log('[useBirdData] 🧹 CLEARING all bird data');
    setBirds([]);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // CRITICAL: Clear birds immediately when NOT enabled
    if (!enabled) {
      console.log('[useBirdData] ⏸️ Disabled - clearing birds immediately');
      clearBirds();
      return;
    }

    const loadBirdData = async () => {
      try {
        console.log('[useBirdData] 🦅 Loading bird data...');
        setLoading(true);
        
        const response = await fetch('/bird_data.geojson');
        
        if (!response.ok) {
          throw new Error('Failed to load bird data');
        }

        const geojson = await response.json();
        
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          throw new Error('Invalid GeoJSON structure');
        }
        
        const birdData: BirdData[] = geojson.features.map((feature: BirdFeature) => ({
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
          name: feature.properties?.birdName || feature.properties?.name,
          species: feature.properties?.birdType || feature.properties?.species
        }));

        if (isMountedRef.current) {
          console.log(`[useBirdData] ✅ Loaded ${birdData.length} birds`);
          setBirds(birdData);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          console.error('[useBirdData] ❌ Error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load bird data');
          setBirds([]);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadBirdData();

    return () => {
      console.log('[useBirdData] 🧹 Cleanup');
      isMountedRef.current = false;
    };
  }, [enabled, clearBirds]);

  return { birds, loading, error };
}
