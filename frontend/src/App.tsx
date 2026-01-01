import React, { useState, useRef, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useFlightData } from './hooks/useFlightData';
import { useMapReady } from './hooks/useMapReady';
import { useSystemMode } from './hooks/useSystemMode';
import { useBirdData } from './hooks/useBirdData';

import ModeSelector from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';

import type { IFlight } from './types/Flight.types';

import { hexToRgb } from './utils/colorUtils';
import { INITIAL_VIEW_STATE, MAP_STYLE_URL, AIRPLANE_ICON_URL, BIRD_ICON_URL } from './constants/mapConfig';

try {
  if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
    maplibregl.setRTLTextPlugin(
      'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
      null as any
    );
  }
} catch (error) {
  console.warn('RTL plugin loading issue:', error);
}

function App() {
  const { currentMode } = useSystemMode();
  
  // Determine if we're in offline mode (showing birds)
  const isOffline = currentMode === 'OFFLINE';
  
  // Only fetch flights when NOT in offline mode
  const { flights, updateFlightColor, loading: flightsLoading } = useFlightData({ 
    pollInterval: 2000,
    enabled: !isOffline 
  });
  
  // Only load birds when in offline mode
  const { birds, loading: birdsLoading } = useBirdData(isOffline);
  
  const isMapReady = useMapReady(150);

  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear selected flight when switching to offline mode
  useEffect(() => {
    if (isOffline && selectedFlight) {
      setSelectedFlight(null);
    }
  }, [isOffline, selectedFlight]);

  const handleColorSelect = async (color: string) => {
    if (!selectedFlight) return;

    try {
      await updateFlightColor(selectedFlight.flightId, color);
      setSelectedFlight(null);
    } catch (error) {
      console.error('Failed to update flight color:', error);
      alert('Failed to update flight color. Please try again.');
    }
  };

  // Dynamic layer switching based on mode
  const layers = useMemo(() => {
    console.log('🔄 Rebuilding layers:', { 
      currentMode, 
      isOffline, 
      birdsCount: birds.length, 
      flightsCount: flights.length 
    });
    
    if (isOffline) {
      // Offline Mode: Show Birds Layer ONLY if we have bird data
      if (birdsLoading) {
        console.log('🐦 OFFLINE MODE: Loading birds...');
        return [];
      }

      console.log('🐦 OFFLINE MODE: Creating bird layer with', birds.length, 'birds');
      if (birds.length === 0) {
        console.warn('⚠️ No birds data available!');
        return [];
      }
      
      return [
        new IconLayer({
          id: 'bird-layer',
          data: birds,
          pickable: false, // Birds are not clickable
          
          iconAtlas: BIRD_ICON_URL,
          iconMapping: {
            bird: { 
              x: 0,
              y: 0, 
              width: 512, 
              height: 512, 
              mask: true, 
              anchorY: 256, 
              anchorX: 256 
            }
          },
          
          getIcon: () => 'bird',
          getPosition: (d: any) => {
            console.log('🐦 Bird position:', d.longitude, d.latitude);
            return [d.longitude, d.latitude];
          },
          getSize: 30,
          getColor: [46, 204, 64, 255], // Green color for birds
          
          transitions: {
            getPosition: 1000
          }
        })
      ];
    } else {
      // Online Mode (SNAP or REALTIME): Show Airplanes Layer ONLY if we have flight data
      if (flightsLoading && flights.length === 0) {
        console.log('✈️ ONLINE MODE: Loading flights...');
        return [];
      }

      console.log('✈️ ONLINE MODE: Creating airplane layer with', flights.length, 'flights');
      if (flights.length === 0) {
        console.warn('⚠️ No flights data available!');
        return [];
      }
      
      return [
        new IconLayer({
          id: 'airplane-layer',
          data: flights,
          pickable: true,
          
          iconAtlas: AIRPLANE_ICON_URL,
          iconMapping: {
            airplane: { 
              x: 0,
              y: 0, 
              width: 512, 
              height: 512, 
              mask: true, 
              anchorY: 256, 
              anchorX: 256 
            }
          },
          
          getIcon: () => 'airplane',
          getPosition: (d: IFlight) => [d.longitude, d.latitude],
          getSize: 30,
          getColor: (d: IFlight) => hexToRgb(d.color || '#FF4136'),
          getAngle: (d: IFlight) => -(d.trueTrack || 0),
          
          onClick: (info) => setSelectedFlight(info.object as IFlight),
          
          transitions: {
            getPosition: 2000,
            getAngle: 500
          },
          
          updateTriggers: {
            getColor: [flights],
            getAngle: [flights]
          }
        })
      ];
    }
  }, [isOffline, birds, flights]);

  return (
    <div 
      ref={containerRef}
      style={styles.container}
    >
      <ModeSelector />

      {isMapReady && (
        <DeckGL
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          getCursor={() => 'pointer'}
          useDevicePixels={false}
          parameters={{}}
          onWebGLInitialized={(gl) => {
            console.log('WebGL engine started', gl);
          }}
        >
          <Map 
            mapStyle={MAP_STYLE_URL}
            reuseMaps={true}
          />
        </DeckGL>
      )}

      {!isMapReady && <LoadingSpinner message="Initializing Radar..." />}

      {selectedFlight && !isOffline && (
        <ColorPicker
          flightId={selectedFlight.flightId}
          onColorSelect={handleColorSelect}
          onCancel={() => setSelectedFlight(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    margin: 0,
    overflow: 'hidden',
    backgroundColor: '#111'
  }
};

export default App;
