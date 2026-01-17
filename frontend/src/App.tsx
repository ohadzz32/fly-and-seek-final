/**
 * App.tsx - Main Application Component
 * 
 * Fly and Seek - Real-time Aircraft Tracking System
 * 
 * Features:
 * - Live aircraft tracking with OpenSky API
 * - Ghost Mode for tracking specific aircraft
 * - Bird observation mode (offline)
 * - Color customization for aircraft
 */

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Hooks
import { useFlightData } from './hooks/useFlightData';
import { useMapReady } from './hooks/useMapReady';
import { useSystemMode } from './hooks/useSystemMode';
import { useBirdData, type BirdData } from './hooks/useBirdData';
import { useSearchAreas } from './hooks/useSearchAreas';
import { useContextMenu } from './hooks/useContextMenu';
import { useSearchAreaLayers } from './hooks/useSearchAreaLayers';

// Components
import { ModeSelector } from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';
import { AircraftContextMenu } from './components/AircraftContextMenu';
import { ErrorBoundary } from './components/ErrorBoundary';

// Types & Constants
import type { IFlight } from './types/Flight.types';
import { RunMode } from './types/enums';
import { INITIAL_VIEW_STATE, MAP_STYLE_URL, BIRD_ICON_URL } from './constants/mapConfig';

// Initialize RTL text plugin for Hebrew support
initializeRTLPlugin();

function initializeRTLPlugin() {
  try {
    if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
      maplibregl.setRTLTextPlugin(
        'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
        true // deferred loading
      );
    }
  } catch {
    // RTL plugin is optional - app works without it
  }
}

// Bird layer icon configuration
const BIRD_ICON_MAPPING = {
  bird: {
    x: 0, y: 0,
    width: 512, height: 512,
    mask: true,
    anchorX: 256, anchorY: 256
  }
};

function App() {
  // System mode management
  const { 
    currentMode, 
    changeMode, 
    loading: modeLoading, 
    error: modeError 
  } = useSystemMode();
  
  const isOffline = currentMode === RunMode.OFFLINE;

  // Data hooks
  const { flights, updateFlightColor } = useFlightData(currentMode);
  const { birds } = useBirdData(isOffline);
  const isMapReady = useMapReady(150);
  
  // Search area (Ghost Mode) management
  const {
    searchAreas,
    animationClock,
    toggleSearchArea,
    hasSearchArea,
    clearAllSearchAreas
  } = useSearchAreas();

  // Clear search areas when mode changes
  useEffect(() => {
    clearAllSearchAreas();
  }, [currentMode, clearAllSearchAreas]);

  // UI state
  const { contextMenu, openMenu, closeMenu } = useContextMenu();
  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  
  // DeckGL reference for picking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);

  // Flight click handler - opens color picker
  const handleFlightClick = useCallback((flight: IFlight) => {
    if (!isOffline) {
      setSelectedFlight(flight);
    }
  }, [isOffline]);

  // Context menu handler - right-click on aircraft
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!deckRef.current || isOffline) return;

    const info = deckRef.current.pickObject({
      x: e.clientX,
      y: e.clientY,
      radius: 10,
      layerIds: ['live-aircraft-layer', 'frozen-aircraft-layer']
    });

    if (info?.object) {
      const aircraft = info.object as IFlight;
      const searchArea = aircraft as IFlight & { originalId?: string };
      const flightId = searchArea.originalId || aircraft.flightId;
      const actualFlight = flights.find(f => f.flightId === flightId) || aircraft;
      openMenu(e.clientX, e.clientY, actualFlight);
    } else {
      closeMenu();
    }
  }, [flights, openMenu, closeMenu, isOffline]);

  // Aircraft layers (live + ghost mode)
  const aircraftLayers = useSearchAreaLayers({
    searchAreas,
    flights,
    animationClock,
    onFlightClick: handleFlightClick
  });

  // Bird layer - stable key prevents unnecessary recreation
  const birdsKey = useMemo(
    () => birds.map(b => `${b.latitude.toFixed(4)},${b.longitude.toFixed(4)}`).join('|'),
    [birds]
  );
  
  const birdLayers = useMemo(() => {
    if (!isOffline || birds.length === 0) return [];
    
    return [
      new IconLayer<BirdData>({
        id: 'bird-layer',
        data: birds,
        iconAtlas: BIRD_ICON_URL,
        iconMapping: BIRD_ICON_MAPPING,
        getIcon: () => 'bird',
        getPosition: (d: BirdData) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: [46, 204, 64, 255]
      })
    ];
  }, [isOffline, birdsKey, birds]);

  // Select layers based on mode
  const layers = useMemo(
    () => isOffline ? birdLayers : aircraftLayers,
    [isOffline, birdLayers, aircraftLayers]
  );

  // Cursor style based on hover state
  const getCursor = useCallback(
    ({ isHovering }: { isHovering: boolean }) => isHovering ? 'pointer' : 'grab',
    []
  );

  return (
    <ErrorBoundary>
      <div 
        style={styles.container}
        onClick={closeMenu}
        onContextMenu={handleContextMenu}
      >
        {/* Mode Selector */}
        <ModeSelector 
          currentMode={currentMode}
          onChangeMode={changeMode}
          loading={modeLoading}
          error={modeError}
        />

        {/* Map */}
        {isMapReady ? (
          <DeckGL
            ref={deckRef}
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            getCursor={getCursor}
          >
            <Map mapStyle={MAP_STYLE_URL} reuseMaps={true} />
          </DeckGL>
        ) : (
          <LoadingSpinner message="אתחול מערכת רדאר..." />
        )}

        {/* Context Menu */}
        {contextMenu.visible && contextMenu.aircraft && !isOffline && (
          <AircraftContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            aircraft={contextMenu.aircraft}
            hasSearchArea={hasSearchArea(contextMenu.aircraft.flightId)}
            onOpenRegularSearch={() => toggleSearchArea(contextMenu.aircraft!, 'regular')}
            onOpenSmartSearch={() => console.log('Smart search not implemented')}
            onClose={closeMenu}
          />
        )}

        {/* Color Picker */}
        {selectedFlight && !isOffline && (
          <ColorPicker
            flightId={selectedFlight.flightId}
            onColorSelect={async (color) => {
              await updateFlightColor(selectedFlight.flightId, color);
              setSelectedFlight(null);
            }}
            onCancel={() => setSelectedFlight(null)}
          />
        )}

        <style>{animationStyles}</style>
      </div>
    </ErrorBoundary>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#050505'
  }
};

const animationStyles = `
  .radar-menu {
    animation: menuAppear 0.1s ease-out;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .menu-item-hover:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  @keyframes menuAppear {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export default App;