import React, { useState, useRef, useMemo, useEffect, use } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Hooks & Types
import { useFlightData } from './hooks/useFlightData';
import { useMapReady } from './hooks/useMapReady';
import { useSystemMode } from './hooks/useSystemMode';
import { useBirdData } from './hooks/useBirdData';
import type { IFlight } from './types/Flight.types';

// Components & Utils
import ModeSelector from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';
import { hexToRgb } from './utils/colorUtils';
import { INITIAL_VIEW_STATE, MAP_STYLE_URL, AIRPLANE_ICON_URL, BIRD_ICON_URL } from './constants/mapConfig';

// RTL Plugin for MapLibre
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
  const isOffline = currentMode === 'OFFLINE';
  
  const { 
    flights, 
    updateFlightColor, 
    toggleGhostMode 
  } = useFlightData();
  
  const { birds } = useBirdData(isOffline);
  const isMapReady = useMapReady(150);

  // --- States ---
  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  const [ staticGhosts, setStaticGhosts ] = useState<IFlight[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    aircraft: IFlight | null;
  }>({ x: 0, y: 0, visible: false, aircraft: null });

  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<any>(null);

  // Close menus when mode changes or clicking outside
  useEffect(() => {
    if (isOffline) {
      setSelectedFlight(null);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [isOffline]);

  // Handle Right Click (Context Menu)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!deckRef.current) return;

    const info = deckRef.current.pickObject({
      x: e.clientX,
      y: e.clientY,
      radius: 10,
      layerIds: ['airplane-layer']
    });

    if (info && info.object) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        visible: true,
        aircraft: info.object as IFlight
      });
    } else {
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

const layers = useMemo(() => {
  // 1. מצב אופליין - מחזיר מערך עם שכבה אחת ויוצא מהפונקציה
  if (isOffline) {
    return [
      new IconLayer({
        id: 'bird-layer',
        data: birds,
        pickable: false,
        iconAtlas: BIRD_ICON_URL,
        iconMapping: { bird: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
        getIcon: () => 'bird',
        getPosition: (d: any) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: [46, 204, 64, 255],
        transitions: { getPosition: 1000 }
      })
    ];
  }

  // 2. הגדרת המערך בחוץ כדי שיהיה נגיש לכל אורך הבלוק
  const activeLayers: any[] = [
    new IconLayer({
      id: 'airplane-layer',
      data: flights,
      pickable: true,
      iconAtlas: AIRPLANE_ICON_URL,
      iconMapping: { airplane: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
      getIcon: () => 'airplane',
      getPosition: (d: IFlight) => [d.longitude, d.latitude],
      getSize: 30,
      getColor: (d: IFlight) => d.isGhost ? [160, 160, 160, 200] : hexToRgb(d.color || '#FF4136'),
      getAngle: (d: IFlight) => -(d.trueTrack || 0),
      onClick: (info) => setSelectedFlight(info.object as IFlight),
      transitions: { getPosition: 2000, getAngle: 500 },
      updateTriggers: { getColor: [flights], getAngle: [flights] }
    })
  ];

  // 3. הזרקת מטוסי הרפאים הסטטיים למערך הקיים
  if (staticGhosts && staticGhosts.length > 0) {
    activeLayers.push(
      new IconLayer({
        id: 'static-ghost-layer',
        data: staticGhosts,
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: { airplane: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
        getIcon: () => 'airplane',
        getPosition: (d: IFlight) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: [160, 160, 160, 150], 
        getAngle: (d: IFlight) => -(d.trueTrack || 0),
      })
    );
  }

  // 4. החזרת המערך המלא (שכבה אחת או שתיים)
  return activeLayers;

}, [isOffline, birds, flights, staticGhosts]);

  return (
    <div 
      ref={containerRef}
      style={styles.container}
      onClick={() => setContextMenu(prev => ({ ...prev, visible: false }))}
      onContextMenu={handleContextMenu}
    >
      <ModeSelector />

      {isMapReady && (
        <DeckGL
          ref={deckRef}
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
        >
          <Map 
            mapStyle={MAP_STYLE_URL} 
            reuseMaps={true}
          />
        </DeckGL>
      )}

      {!isMapReady && <LoadingSpinner message="אתחול מערכת רדאר..." />}

      {/* --- Context Menu מעוצב ואחיד --- */}
      {contextMenu.visible && contextMenu.aircraft && (
        <div 
          className="radar-menu"
          style={{
            ...styles.contextMenu,
            top: contextMenu.y - 10,
            left: contextMenu.x + 10,
          }}
          onClick={(e) => e.stopPropagation()} 
        >
          <div style={styles.menuHeader}>
            מטוס: {contextMenu.aircraft.flightId}
          </div>
          
          {/* אפשרות 1 - חיפוש רגיל */}
          <div 
            style={{
              ...styles.menuItem,
              color: contextMenu.aircraft.isGhost ? '#00ff88' : '#fff'
            }}
            className="menu-item-hover"
            onClick={async (e) => {
              e.stopPropagation();
              if (contextMenu.aircraft) {
                const ghostSnapshot: IFlight = {
                 ...contextMenu.aircraft, 
                 flightId: `${contextMenu.aircraft.flightId}-ghost-${Date.now()}`,
                 isGhost: false 
                };
                setStaticGhosts(prev => [...prev, ghostSnapshot]);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }
            }}
          >
            <span style={{ marginLeft: '10px', fontSize: '16px' }}>
              {contextMenu.aircraft.isGhost ? '●' : '○'}
            </span>
            <span>{contextMenu.aircraft.isGhost ? 'בטל מצב רפאים' : 'הפעל מצב רפאים'}</span>
            {contextMenu.aircraft.isGhost && <span style={{ marginRight: 'auto', color: '#00ff88' }}>✓</span>}
          </div>

          {/* אפשרות 2 - חיפוש חכם */}
          <div 
            style={{
              ...styles.menuItem,
              color: '#fff'
            }}
            className="menu-item-hover"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                console.log("Smart Search clicked");
              } catch (error) {
                console.error('Failed to open smart search:', error);
              } finally {
                setContextMenu(prev => ({ ...prev, visible: false }));
              }
            }}
          >
            <span style={{ marginLeft: '10px', fontSize: '16px' }}>○</span>
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
        .radar-menu { animation: menuAppear 0.15s ease-out; backdrop-filter: blur(12px); }
        .menu-item-hover:hover { background-color: rgba(255, 255, 255, 0.1); }
        @keyframes menuAppear { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100vw', height: '100vh',
    backgroundColor: '#0a0a0a',
    overflow: 'hidden'
  },
  contextMenu: {
    position: 'fixed',
    minWidth: '200px',
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    zIndex: 10000,
    direction: 'rtl',
    padding: '6px'
  },
  menuHeader: {
    padding: '8px 12px',
    fontSize: '10px',
    color: '#777',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    marginBottom: '4px',
    fontWeight: 'bold',
    letterSpacing: '1px'
  },
  menuItem: {
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  disabledItem: {
    color: '#555',
    cursor: 'pointer',
  }
};

export default App; 

