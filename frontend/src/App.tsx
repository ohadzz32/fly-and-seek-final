import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer, LineLayer, PolygonLayer } from '@deck.gl/layers';
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

// Simple seeded PRNG
function pseudoRandom(seed: number) {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateAmorphousBlob(centerLon: number, centerLat: number, radiusMeters: number, flightId: string) {
  const seed = hashString(flightId);
  const points = 12;
  const coordinates = [];
  
  // Approx meters to degrees
  const latToDeg = 1 / 111320;
  const lonToDeg = 1 / (111320 * Math.cos(centerLat * Math.PI / 180));

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = pseudoRandom(seed + i); 
    const randomFactor = 0.8 + (r * 0.4); // 0.8 to 1.2
    
    const rMeters = radiusMeters * randomFactor;
    
    const dLon = rMeters * Math.sin(angle) * lonToDeg;
    const dLat = rMeters * Math.cos(angle) * latToDeg;
    
    coordinates.push([centerLon + dLon, centerLat + dLat]);
  }
  
  return [coordinates]; // PolygonLayer expects array of polygon rings
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

  const { flights, updateFlightColor, noData } = useFlightData(currentMode);
  const normalizedFlights = useMemo(
    () => flights.filter(flight => Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude)),
    [flights]
  );
  const { birds, loading: birdsLoading } = useBirdData(isOffline);
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
  
  const smartSearch = useSmartSearch();

  useEffect(() => {
    smartSearch.updateTrackedFlights(normalizedFlights);
  }, [normalizedFlights, smartSearch.updateTrackedFlights]);

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
    flights: normalizedFlights,
    animationClock,
    onFlightClick: handleFlightClick,
    smartSearchTrackedFlightIds: Object.keys(smartSearch.trackedFlights)
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

    if (!showRiskMap) {
      const trackedIds = Object.keys(smartSearch.trackedFlights);
      for (const flightId of trackedIds) {
        const pred = smartSearch.predictions[flightId];
        const aircraft = smartSearch.trackedFlights[flightId];

        // Stability Check: Ensure coordinates exist
        if (pred && aircraft && aircraft.longitude !== undefined && aircraft.latitude !== undefined) {
          
          // Render Amorphous Polygon (HDR Blob) instead of Scatterplot
          const uncertaintyRadius = Math.min(pred.uncertainty_m || 500, 10000);
          const blobData = generateAmorphousBlob(pred.longitude, pred.latitude, uncertaintyRadius, aircraft.flightId);

          finalLayers.push(
            new PolygonLayer<any>({
              id: `smart-search-area-${flightId}`,
              data: [{ polygon: blobData[0] }],
              getPolygon: (d) => d.polygon,
              getFillColor: [200, 230, 255, 40], // Transparent light blue
              getLineColor: [255, 255, 255, 200], // Glowing white border
              stroked: true,
              filled: true,
              lineWidthMinPixels: 2
            })
          );

          finalLayers.push(
            new LineLayer<any>({
              id: `smart-search-connection-${flightId}`,
              data: [{ 
                source: [aircraft.longitude, aircraft.latitude],
                target: [pred.longitude, pred.latitude]
              }],
              getSourcePosition: (d) => d.source,
              getTargetPosition: (d) => d.target,
              getColor: [255, 255, 255, 100], // Alpha 0.4
              getWidth: 2,
              widthMinPixels: 2
            })
          );

          finalLayers.push(
            new IconLayer<any>({
              id: `smart-search-prediction-${flightId}`,
              data: [pred],
              iconAtlas: AIRPLANE_ICON_URL,
              iconMapping: AIRCRAFT_ICON_MAPPING,
              getIcon: () => 'airplane',
              getPosition: (d) => [d.longitude, d.latitude],
              getSize: 36, // 1.2x size of original (30 * 1.2)
              getColor: [255, 255, 255, 255], // Pure White for Ghost/HDR effect
              getAngle: () => {
                const track = aircraft.trueTrack;
                if (track === undefined || track === null) return 90;
                return 90 - track;
              },
              billboard: false,
              parameters: {
                depthTest: false,
                depthMask: false
              } as any,
              transitions: {
                getPosition: {
                  duration: 1000,
                  type: 'interpolation'
                },
                getAngle: 2000
              }
            })
          );
        }
      }
    }

    return finalLayers;
  }, [isOffline, birdLayers, aircraftLayers, riskHexLayer, showRiskMap, smartSearch.trackedFlights, smartSearch.predictions]);

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

        {!isMapReady ? (
          <LoadingSpinner message="Loading map..." />
        ) : (() => {
          const hasVisualData = isOffline ? birds.length > 0 : normalizedFlights.length > 0;
          const noDataForMode = isOffline ? (!birdsLoading && birds.length === 0) : noData;

          if (noDataForMode) {
            return <LoadingSpinner message="No Data Available in this Mode" />;
          }

          if (!hasVisualData) {
            return <LoadingSpinner message="Loading flights..." />;
          }

          return (
          <DeckGL
            ref={deckRef}
            key={currentMode}
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            getCursor={getCursor}
            getTooltip={getTooltip}
          >
            <Map mapStyle={MAP_STYLE_URL} reuseMaps={true} />
          </DeckGL>
          );
        })()}

        {contextMenu.visible && contextMenu.aircraft && !isOffline && (
          <AircraftContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            aircraft={contextMenu.aircraft}
            hasSearchArea={hasSearchArea(contextMenu.aircraft.flightId)}
            isSmartSearchActive={smartSearch.isTracking(contextMenu.aircraft.flightId)}
            onOpenRegularSearch={() => toggleSearchArea(contextMenu.aircraft!, 'regular')}
            onOpenSmartSearch={() => smartSearch.toggleTracking(contextMenu.aircraft!)}
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
