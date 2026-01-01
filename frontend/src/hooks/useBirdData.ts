import { useState, useEffect } from 'react';

interface BirdFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    species?: string;
    [key: string]: any;
  };
}

interface BirdData {
  longitude: number;
  latitude: number;
  name?: string;
  species?: string;
}

export function useBirdData(enabled: boolean = true) {
  const [birds, setBirds] = useState<BirdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBirds([]);
      setLoading(false);
      return;
    }

    const loadBirdData = async () => {
      try {
        setLoading(true);
        // Load the bird GeoJSON data from the public folder
        const response = await fetch('/bird_data.geojson');
        
        if (!response.ok) {
          throw new Error('Failed to load bird data');
        }

        const geojson = await response.json();
        
        // Check if we have a valid FeatureCollection
        if (!geojson || typeof geojson !== 'object') {
          throw new Error('Invalid GeoJSON: Not an object');
        }

        if (geojson.type !== 'FeatureCollection') {
          throw new Error(`Invalid GeoJSON type: ${geojson.type}`);
        }

        if (!Array.isArray(geojson.features)) {
          throw new Error('Invalid GeoJSON: features is not an array');
        }
        
        // Transform GeoJSON features to simple bird objects
        const birdData: BirdData[] = geojson.features.map((feature: BirdFeature) => ({
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
          name: feature.properties?.birdName || feature.properties?.name,
          species: feature.properties?.birdType || feature.properties?.species
        }));

        console.log('🐦 useBirdData: Loaded birds:', birdData.length);
        console.log('🐦 First 3 birds:', birdData.slice(0, 3));
        setBirds(birdData);
        setError(null);
      } catch (err) {
        console.error('Error loading bird data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load bird data');
        setBirds([]);
      } finally {
        setLoading(false);
      }
    };

    loadBirdData();
  }, [enabled]);

  return { birds, loading, error };
}
