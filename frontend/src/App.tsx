import React, { useState, useRef, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Hooks & Types
import { useFlightData } from './hooks/useFlightData';
import { useMapReady } from './hooks/useMapReady';
import { useSystemMode } from './hooks/useSystemMode';
import { useBirdData } from './hooks/useBirdData';
import type { IFlight, StaticGhost } from './types/Flight.types';

// Components & Utils
import ModeSelector from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';
import { DataSourceToggle } from './components/DataSourceToggle';
import { StatsPanel } from './components/StatsPanel';
import { hexToRgb } from './utils/colorUtils';
import { INITIAL_VIEW_STATE, MAP_STYLE_URL, AIRPLANE_ICON_URL, BIRD_ICON_URL } from './constants/mapConfig';

// RTL Plugin
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
  const { currentMode, changeMode } = useSystemMode();
  const isOffline = currentMode === 'OFFLINE';

  const { flights, updateFlightColor, connected, loading, error } = useFlightData();
  const { birds } = useBirdData(isOffline);
  const isMapReady = useMapReady(150);

  // Historical mode state (true = historical, false = real-time)
  const [isHistoricalMode, setIsHistoricalMode] = useState(true);

  // --- States ---
  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  const [staticGhosts, setStaticGhosts] = useState<StaticGhost[]>([]);
  const [ghostClock, setGhostClock] = useState(Date.now());
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    aircraft: IFlight | null;
  }>({ x: 0, y: 0, visible: false, aircraft: null });

  const deckRef = useRef<any>(null);

  // Handle data source toggle
  const handleDataSourceToggle = (historical: boolean) => {
    setIsHistoricalMode(historical);
    if (!historical) {
      // Switch to real-time mode
      changeMode('REALTIME');
    }
    // Note: Historical mode is handled by Socket.io streaming (always active)
    // The backend automatically starts streaming when connected
  };

  // שעון פעימות לאנימציה חלקה של התרחבות העיגול
  useEffect(() => {
    const interval = setInterval(() => {
      setGhostClock(Date.now());
    }, 30);
    return () => clearInterval(interval);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deckRef.current) return;

    const info = deckRef.current.pickObject({
      x: e.clientX,
      y: e.clientY,
      radius: 10,
      layerIds: ['airplane-layer', 'static-ghost-layer']
    });

    if (info && info.object) {
      // אם זה טראק רפאים (מטוס אפור), נמצא את המידע המקורי שלו לצורך התפריט
      const aircraftData = info.object.originalId 
        ? flights.find(f => f.flightId === info.object.originalId) || info.object
        : info.object;

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        visible: true,
        aircraft: aircraftData as IFlight
      });
    } else {
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const layers = useMemo(() => {
    if (isOffline) {
      return [
        new IconLayer({
          id: 'bird-layer',
          data: birds,
          iconAtlas: BIRD_ICON_URL,
          iconMapping: { bird: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
          getIcon: () => 'bird',
          getPosition: (d: any) => [d.longitude, d.latitude],
          getSize: 30,
          getColor: [46, 204, 64, 255],
        })
      ];
    }

    return [
      // 1. שכבת העיגול המתרחב - נשארת בנקודת הקיפאון
      new ScatterplotLayer({
        id: 'search-radius-layer',
        data: staticGhosts,
        getPosition: (d: StaticGhost) => [d.longitude, d.latitude],
        getRadius: (d: StaticGhost) => {
          const timeElapsedSeconds = (ghostClock - d.frozenAt) / 1000;
          const velocityMPS = (d.velocity || 0) / 3.6; 
          return timeElapsedSeconds * velocityMPS * 1.5; // +50% מרווח בטיחות
        },
        getFillColor: [0, 255, 136, 40],
        getLineColor: [0, 255, 136, 180],
        stroked: true,
        lineWidthMinPixels: 2,
        updateTriggers: { getRadius: ghostClock }
      }),

      // 2. קו אפור בין המטוס הקפוא לטראק הרפאים (המטוס הנע)
      new LineLayer({
        id: 'connection-line-layer',
        data: staticGhosts,
        getSourcePosition: (d: StaticGhost) => [d.longitude, d.latitude],
        getTargetPosition: (d: StaticGhost) => {
          const liveFlight = flights.find(f => f.flightId === d.originalId);
          return liveFlight ? [liveFlight.longitude, liveFlight.latitude] : [d.longitude, d.latitude];
        },
        getColor: [200, 200, 200, 255],
        getWidth: 5,
        widthMinPixels: 3,
        updateTriggers: { getTargetPosition: flights }
      }),

      // 3. המטוס הקפוא (אייקון צהוב סטטי)
      new IconLayer({
        id: 'static-ghost-layer',
        data: staticGhosts,
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: { airplane: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
        getIcon: () => 'airplane',
        getPosition: (d: StaticGhost) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: [255, 255, 0, 255],
        getAngle: (d: StaticGhost) => (d.trueTrack || 0) + 180,
      }),

      // 4. המטוסים האמיתיים (כולל הפיכה ל"טראק רפאים" אפור)
      new IconLayer({
        id: 'airplane-layer',
        data: flights,
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: { airplane: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
        getIcon: () => 'airplane',
        getPosition: (d: IFlight) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: (d: IFlight) => {
          const isBeingTracked = staticGhosts.some(g => g.originalId === d.flightId);
          return isBeingTracked ? [150, 150, 150, 255] : hexToRgb(d.color || '#FF4136');
        },
        getAngle: (d: IFlight) => (d.trueTrack || 0) + 180,
        onClick: (info) => setSelectedFlight(info.object as IFlight),
        transitions: { 
          getPosition: 2000,
          getAngle: 500 
        },
        updateTriggers: { getColor: staticGhosts }
      })
    ];
  }, [isOffline, birds, flights, staticGhosts, ghostClock]);

  return (
    <div 
      style={styles.container}
      onClick={() => setContextMenu(prev => ({ ...prev, visible: false }))}
      onContextMenu={handleContextMenu}
    >
      <ModeSelector />

      {!isOffline && (
        <>
          <StatsPanel
            connected={connected}
            flightCount={flights.length}
            isHistorical={isHistoricalMode}
          />
          
          <DataSourceToggle
            isHistorical={isHistoricalMode}
            onToggle={handleDataSourceToggle}
            connected={connected}
            flightCount={flights.length}
          />
        </>
      )}

      {isMapReady && (
        <DeckGL
          ref={deckRef}
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
        >
          <Map mapStyle={MAP_STYLE_URL} reuseMaps={true} />
        </DeckGL>
      )}

      {!isMapReady && <LoadingSpinner message="אתחול מערכת רדאר..." />}

      {/* תפריט קליק ימני */}
      {contextMenu.visible && contextMenu.aircraft && (
        <div 
          className="radar-menu"
          style={{ ...styles.contextMenu, top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} 
        >
          <div style={styles.menuHeader}>מזהה: {contextMenu.aircraft.flightId}</div>
          
          <div 
            style={{
              ...styles.menuItem,
              color: staticGhosts.some(g => g.originalId === contextMenu.aircraft?.flightId) ? '#00ff88' : '#fff'
            }}
            className="menu-item-hover"
            onClick={() => {
              const aircraftId = contextMenu.aircraft!.flightId;
              const isAlreadyTracked = staticGhosts.some(g => g.originalId === aircraftId);

              if (isAlreadyTracked) {
                // סגירת אזור החיפוש
                setStaticGhosts(prev => prev.filter(g => g.originalId !== aircraftId));
              } else {
                // פתיחת אזור חיפוש רגיל - מקפיא את המידע הנוכחי
                const searchArea = {
                  ...contextMenu.aircraft!,
                  originalId: aircraftId,
                  frozenAt: Date.now(),
                };
                setStaticGhosts(prev => [...prev, searchArea]);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            <span style={{ marginLeft: '10px' }}>
              {staticGhosts.some(g => g.originalId === contextMenu.aircraft?.flightId) ? '✓' : '○'}
            </span>
            <span>פתח אזור חיפוש רגיל</span>
          </div>

          <div style={styles.menuItem} className="menu-item-hover">
            <span style={{ marginLeft: '10px' }}>○</span>
            <span>פתח אזור חיפוש חכם</span>
          </div>
        </div>
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

      <style>{`
        .radar-menu { animation: menuAppear 0.1s ease-out; backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); }
        .menu-item-hover:hover { background-color: rgba(255, 255, 255, 0.1); }
        @keyframes menuAppear { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a' },
  contextMenu: { position: 'fixed', minWidth: '220px', backgroundColor: 'rgba(15, 15, 15, 0.95)', borderRadius: '8px', zIndex: 10000, direction: 'rtl', padding: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.8)', border: '1px solid rgba(255, 255, 255, 0.1)' },
  menuHeader: { padding: '10px 12px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '4px', fontWeight: 'bold' },
  menuItem: { padding: '12px 12px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', borderRadius: '4px', color: '#fff', transition: 'all 0.2s ease' }
};

export default App;
