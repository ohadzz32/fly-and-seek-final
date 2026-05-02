import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useFlightData } from './hooks/useFlightData';
import { useMapReady } from './hooks/useMapReady';
import { useSystemMode } from './hooks/useSystemMode';
import { useBirdData, type BirdData } from './hooks/useBirdData';
import { useSearchAreas } from './hooks/useSearchAreas';
import { useContextMenu } from './hooks/useContextMenu';
import { useSearchAreaLayers } from './hooks/useSearchAreaLayers';
import { useGlobalRiskMap } from './hooks/useGlobalRiskMap';
import { useRiskHexLayer } from './hooks/useRiskHexLayer';
import { useSmartSearch } from './hooks/useSmartSearch';

import { ModeSelector } from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';
import { AircraftContextMenu } from './components/AircraftContextMenu';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RiskLegend } from './components/RiskLegend';
import { RiskMapToggle } from './components/RiskMapToggle';

import type { IFlight } from './types/Flight.types';
import type { RiskHexCell } from './types/RiskMap.types';
import { RunMode } from './types/enums';
import { 
  INITIAL_VIEW_STATE, 
  MAP_STYLE_URL, 
  BIRD_ICON_URL,
  AIRPLANE_ICON_URL 
} from './constants/mapConfig';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EntranceScreen } from './components/EntranceScreen';

initializeRTLPlugin();

function initializeRTLPlugin() {
  try {
    if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
      maplibregl.setRTLTextPlugin(
        'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
        true
      );
    }
  } catch {
  }
}

const BIRD_ICON_MAPPING = {
  bird: {
    x: 0, y: 0,
    width: 512, height: 512,
    mask: true,
    anchorX: 256, anchorY: 256
  }
};

const AIRCRAFT_ICON_MAPPING = {
  airplane: {
    x: 0, y: 0,
    width: 512, height: 512,
    mask: true,
    anchorX: 256, anchorY: 256
  }
};

function MainContent() {
  const [showRiskMap, setShowRiskMap] = useState(false);
  const { 
    currentMode, 
    changeMode, 
    loading: modeLoading, 
    error: modeError 
  } = useSystemMode();
  
  const isOffline = currentMode === RunMode.OFFLINE;

  const { flights, updateFlightColor } = useFlightData(currentMode);
  const { birds } = useBirdData(isOffline);
  const isMapReady = useMapReady(150);
  const { riskCells } = useGlobalRiskMap();
  const riskHexLayer = useRiskHexLayer({ riskCells, visible: showRiskMap });
  
  const {
    searchAreas,
    animationClock,
    toggleSearchArea,
    hasSearchArea,
    clearAllSearchAreas
  } = useSearchAreas();

  useEffect(() => {
    clearAllSearchAreas();
  }, [currentMode, clearAllSearchAreas]);

  const { contextMenu, openMenu, closeMenu } = useContextMenu();
  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  
  const smartSearch = useSmartSearch(contextMenu.aircraft);

  const deckRef = useRef<any>(null);

  const handleFlightClick = useCallback((flight: IFlight) => {
    if (!isOffline) {
      setSelectedFlight(flight);
    }
  }, [isOffline]);

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

  const aircraftLayers = useSearchAreaLayers({
    searchAreas,
    flights,
    animationClock,
    onFlightClick: handleFlightClick
  });

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

  const layers = useMemo(() => {
    const dynamicLayers: Layer<any>[] = (isOffline ? birdLayers : aircraftLayers) as Layer<any>[];
    const finalLayers: Layer<any>[] = (riskHexLayer && showRiskMap)
      ? [riskHexLayer as Layer<any>, ...dynamicLayers]
      : [...dynamicLayers];

    if (smartSearch.isActive && smartSearch.prediction && smartSearch.trackedFlight && !showRiskMap) {
      const pred = smartSearch.prediction;
      const aircraft = smartSearch.trackedFlight;
      
      console.log('[App] 🎨 Rendering Smart Search layers for:', aircraft.flightId, 'at', pred);

      finalLayers.push(
        new ScatterplotLayer<any>({
          id: 'smart-search-area',
          data: [pred],
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: (d) => Math.min(d.uncertainty_m || 500, 10000), // Cap at 10km
          getFillColor: [255, 0, 0, 80], // Light Red (Transparent)
          getLineColor: [255, 255, 255, 255],
          stroked: true,
          lineWidthMinPixels: 3
        })
      );

      finalLayers.push(
        new LineLayer<any>({
          id: 'smart-search-connection',
          data: [{ 
            source: [aircraft.longitude, aircraft.latitude],
            target: [pred.longitude, pred.latitude]
          }],
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getColor: [255, 0, 0, 255], // Bright Solid Red
          getWidth: 6,
          widthMinPixels: 4
        })
      );

      finalLayers.push(
        new IconLayer<any>({
          id: 'smart-search-prediction',
          data: [pred],
          iconAtlas: AIRPLANE_ICON_URL,
          iconMapping: AIRCRAFT_ICON_MAPPING,
          getIcon: () => 'airplane',
          getPosition: (d) => [d.longitude, d.latitude],
          getSize: 45,
          getColor: [255, 50, 0, 255], // Bright Orange-Red
          getAngle: () => -(aircraft.trueTrack || 0)
        })
      );
    }

    return finalLayers;
  }, [isOffline, birdLayers, aircraftLayers, riskHexLayer, showRiskMap, smartSearch.isActive, smartSearch.prediction, smartSearch.trackedFlight]);

  const getTooltip = useCallback((info: PickingInfo) => {
    if (info.layer?.id !== 'risk-h3-layer' || !info.object) {
      return null;
    }

    const cell = info.object as RiskHexCell;
    const aircraftCount = cell.details?.aircraft_count ?? 'N/A';
    const avgAlt = cell.details?.avg_alt ?? 'N/A';

    return {
      text: [
        `Hex: ${cell.hex}`,
        `Risk: ${cell.risk}`,
        `Label: ${cell.label}`,
        `aircraft_count: ${aircraftCount}`,
        `avg_alt: ${avgAlt}`
      ].join('\n'),
      style: {
        backgroundColor: 'rgba(10, 10, 10, 0.92)',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '6px',
        fontSize: '12px',
        padding: '8px'
      }
    };
  }, []);

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
        <ModeSelector 
          currentMode={currentMode}
          onChangeMode={changeMode}
          loading={modeLoading}
          error={modeError}
        />

        <RiskMapToggle showRiskMap={showRiskMap} onToggle={setShowRiskMap} />

        {showRiskMap && <RiskLegend />}

        {isMapReady ? (
          <DeckGL
            ref={deckRef}
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            getCursor={getCursor}
            getTooltip={getTooltip}
          >
            <Map mapStyle={MAP_STYLE_URL} reuseMaps={true} />
          </DeckGL>
        ) : (
          <LoadingSpinner message="אתחול מערכת רדאר..." />
        )}

        {contextMenu.visible && contextMenu.aircraft && !isOffline && (
          <AircraftContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            aircraft={contextMenu.aircraft}
            hasSearchArea={hasSearchArea(contextMenu.aircraft.flightId)}
            onOpenRegularSearch={() => toggleSearchArea(contextMenu.aircraft!, 'regular')}
            onOpenSmartSearch={() => smartSearch.setIsActive(!smartSearch.isActive)}
            onClose={closeMenu}
          />
        )}

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

function AuthWrapper() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner message="Authenticating Personnel..." />;
  }

  if (!user) {
    return <EntranceScreen />;
  }

  return <MainContent />;
}

function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  );
}

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
