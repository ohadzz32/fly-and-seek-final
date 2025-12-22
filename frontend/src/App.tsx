import { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';

// הגדרת פלאגין לעברית
if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
  maplibregl.setRTLTextPlugin(
    'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
    (error) => { if (error) console.error('RTL Text Plugin Error:', error); },
    true 
  );
}

const INITIAL_VIEW_STATE_OF_ISREAL = { 
  longitude: 34.8, // מרכז ישראל
  latitude: 31.5,
  zoom: 7,
  pitch: 0,
  bearing: 0
};

const COLORS = [
  { name: 'Red', hex: '#FF4136' },
  { name: 'Blue', hex: '#0074D9' },
  { name: 'Green', hex: '#2ECC40' },
  { name: 'Yellow', hex: '#FFDC00' },
  { name: 'Purple', hex: '#B10DC9' }
];

const hexToRgb = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
};

function App() {
  const [flights, setFlights] = useState<any[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<any>(null);

  const fetchFlights = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/flights');
      const data = await response.json();
      console.log("Fetched flights:", data); // בדיקה ב-Console
      setFlights(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchFlights();
    const interval = setInterval(fetchFlights, 10000); // רענון כל 10 שניות
    return () => clearInterval(interval);
  }, []);

  const updateColor = async (colorHex: string) => {
    if (!selectedFlight) return;
    try {
      await fetch(`http://localhost:3001/api/flights/${selectedFlight.flightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: colorHex })
      });
      setFlights(prev => prev.map(f => 
        f.flightId === selectedFlight.flightId ? { ...f, color: colorHex } : f
      ));
      setSelectedFlight(null);
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  // יצירת השכבה בצורה תקינה
  const layers = [
    new IconLayer({
      id: 'airplane-layer',
      data: flights,
      pickable: true,
      iconAtlas: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png',
      iconMapping: {
        airplane: { x: 128, y: 0, width: 128, height: 128, mask: true } // שים לב ל-width: 128!
      },
      getIcon: () => 'airplane',
      getPosition: (d: any) => [d.longitude, d.latitude],
      getSize: 40,
      getColor: (d: any) => hexToRgb(d.color || '#FFDC00'),
      getAngle: (d: any) => 45 - (d.trueTrack || 0), // סיבוב המטוס
      onClick: (info) => setSelectedFlight(info.object),
      updateTriggers: {
        getColor: [flights],
        getAngle: [flights]
      }
    })
  ];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', margin: 0 }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE_OF_ISREAL}
        controller={true}
        layers={layers} // העברת מערך השכבות לכאן
        getCursor={() => 'pointer'}
      >
        <Map 
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" 
        />
      </DeckGL>

      {/* תפריט צף לבחירת צבע */}
      {selectedFlight && (
        <div style={{
          position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.85)',
          color: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #444',
          width: '220px', zIndex: 1000, fontFamily: 'sans-serif'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Flight: {selectedFlight.flightId}</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button
                key={c.hex}
                onClick={() => updateColor(c.hex)}
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: c.hex, border: '2px solid white', cursor: 'pointer'
                }}
              />
            ))}
          </div>
          <button onClick={() => setSelectedFlight(null)} style={{ marginTop: '10px', width: '100%' }}>Close</button>
        </div>
      )}
    </div>
  );
}

export default App;