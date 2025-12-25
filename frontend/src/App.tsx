import { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import ModeSelector from './components/ModeSelector';

try {
  if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
    maplibregl.setRTLTextPlugin(
      'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
      null as any 
    );
  }
}

catch (error) {
  console.warn('RTL plugin loading issue:', error);
}

const INITIAL_VIEW_STATE_OF_ISREAL = { 
  longitude: 34.8, 
  latitude: 31.5,
  zoom: 6,
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

const hexToRgb = (hex: string): [number, number, number] => { // deck gl use rgb numbers (1-255)(...)(...)
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
      setFlights(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchFlights();
    const interval = setInterval(fetchFlights, 500); 
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
      console.error("Update failed color change", err);
    }
  };

const layers = [
  new IconLayer({
    id: 'airplane-layer',
    data: flights,
    pickable: true,
    iconAtlas: 'https://img.icons8.com/ios-filled/512/FFFFFF/fighter-jet.png',
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
    getPosition: (d: any) => [d.longitude, d.latitude],
    getSize: 25,          
    getColor: (d: any) => hexToRgb(d.color || '#121002ff'),
    
    getAngle: (d: any) => -(d.trueTrack || 0),
    
    onClick: (info) => setSelectedFlight(info.object),
    updateTriggers: {
      getColor: [flights],
      getAngle: [flights]
    }
  })
];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', margin: 0, overflow: 'hidden' }}>
      
      <ModeSelector />

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE_OF_ISREAL}
        controller={true}
        layers={layers}
        getCursor={() => 'pointer'}
      >
        <Map 
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" 
        />
      </DeckGL>

      {selectedFlight && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', 
          background: 'rgba(0,0,0,0.85)', color: 'white', padding: '20px', 
          borderRadius: '12px', border: '1px solid #444', zIndex: 1001
        }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Flight: {selectedFlight.flightId}</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
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