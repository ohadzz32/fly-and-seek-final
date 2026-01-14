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
import type { IFlight } from './types/Flight.types';

// Components & Utils
import ModeSelector from './components/ModeSelector';
import { ColorPicker } from './components/ColorPicker';
import { LoadingSpinner } from './components/LoadingSpinner';
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
  const { currentMode } = useSystemMode();
  const isOffline = currentMode === 'OFFLINE';

  const { flights, updateFlightColor } = useFlightData();
  const { birds } = useBirdData(isOffline);
  const isMapReady = useMapReady(150);

  // --- States ---
  const [selectedFlight, setSelectedFlight] = useState<IFlight | null>(null);
  const [staticGhosts, setStaticGhosts] = useState<any[]>([]);
  const [ghostClock, setGhostClock] = useState(Date.now()); // "הדופק" שמניע את הרדיוס
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    aircraft: IFlight | null;
  }>({ x: 0, y: 0, visible: false, aircraft: null });

  const deckRef = useRef<any>(null);

  // עדכון השעון כל 100 מילישניות עבור אנימציה חלקה של העיגול
  useEffect(() => {
    const interval = setInterval(() => {
      setGhostClock(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOffline) {
      setSelectedFlight(null);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [isOffline]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deckRef.current) return;

    // הגדרת זיהוי קליק ימני גם על השכבה הרגילה וגם על המטוס הקפוא
    const info = deckRef.current.pickObject({
      x: e.clientX,
      y: e.clientY,
      radius: 10,
      layerIds: ['airplane-layer', 'static-ghost-layer']
    });

    if (info && info.object) {
      // אם לחצנו על מטוס קפוא, נשלוף את המידע המקורי שלו לצורך התפריט
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
      // 1. שכבת העיגול המתרחב (Scatterplot)
      new ScatterplotLayer({
        id: 'search-radius-layer',
        data: staticGhosts,
        getPosition: d => [d.longitude, d.latitude],
        // חישוב הרדיוס: (זמן עכשיו - זמן קפיאה) * מהירות (המרה למטר/שנייה)
        getRadius: d => {
          const timeElapsedSeconds = (ghostClock - d.frozenAt) / 1000;
          const velocityMPS = (d.velocity || 0) / 3.6; 
          return timeElapsedSeconds * velocityMPS;
        },
        getFillColor: [0, 255, 136, 40],
        getLineColor: [0, 255, 136, 180],
        stroked: true,
        lineWidthMinPixels: 2,
        updateTriggers: { getRadius: [ghostClock] }
      }),

      // 2. שכבת הקו המחבר (LineLayer)
      new LineLayer({
        id: 'connection-line-layer',
        data: staticGhosts,
        getSourcePosition: d => [d.longitude, d.latitude], // המרכז הקפוא
        getTargetPosition: d => {
          // מחפש את המיקום העדכני של המטוס המקורי מתוך מערך הטיסות
          const liveFlight = flights.find(f => f.flightId === d.originalId);
          return liveFlight ? [liveFlight.longitude, liveFlight.latitude] : [d.longitude, d.latitude];
        },
        getColor: [150, 150, 150, 150],
        getWidth: 2,
        updateTriggers: { getTargetPosition: [flights] }
      }),

      // 3. המטוס הקפוא (אייקון צהוב סטטי)
      new IconLayer({
        id: 'static-ghost-layer',
        data: staticGhosts,
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: { airplane: { x: 0, y: 0, width: 512, height: 512, mask: true, anchorY: 256, anchorX: 256 } },
        getIcon: () => 'airplane',
        getPosition: (d: any) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: [255, 255, 0, 255],
        getAngle: (d: any) => -(d.trueTrack || 0),
      }),

      // 4. המטוסים האמיתיים (כולל טראק רפאים אפור)
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
          // אם המטוס נמצא במצב חיפוש, צבע אותו באפור
          const isBeingTracked = staticGhosts.some(g => g.originalId === d.flightId);
          return isBeingTracked ? [130, 130, 130, 200] : hexToRgb(d.color || '#FF4136');
        },
        getAngle: (d: IFlight) => -(d.trueTrack || 0),
        onClick: (info) => setSelectedFlight(info.object as IFlight),
        transitions: { getPosition: 2000, getAngle: 500 },
        updateTriggers: { getColor: [staticGhosts, flights] }
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
                // ביטול מצב חיפוש
                setStaticGhosts(prev => prev.filter(g => g.originalId !== aircraftId));
              } else {
                // הפעלת מצב חיפוש - שומר את המהירות והמיקום הנוכחיים
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
              {staticGhosts.some(g => g.originalId === contextMenu.aircraft?.flightId) ? '●' : '○'}
            </span>
            <span>{staticGhosts.some(g => g.originalId === contextMenu.aircraft?.flightId) ? 'סגור אזור חיפוש רגיל' : 'פתח אזור חיפוש רגיל'}</span>
            {staticGhosts.some(g => g.originalId === contextMenu.aircraft?.flightId) && (
              <span style={{ marginRight: 'auto', color: '#00ff88' }}>✓</span>
            )}
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
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#050505' },
  contextMenu: { position: 'fixed', minWidth: '220px', backgroundColor: 'rgba(25, 25, 25, 0.95)', borderRadius: '8px', zIndex: 10000, direction: 'rtl', padding: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  menuHeader: { padding: '10px 12px', fontSize: '10px', color: '#666', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' },
  menuItem: { padding: '12px 12px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', borderRadius: '4px', color: '#fff', transition: 'all 0.2s ease' }
};

export default App;
