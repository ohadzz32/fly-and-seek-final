import React from 'react';
import type { RunMode, ModeOption } from '../types/Config.types';
import { useSystemMode } from '../hooks/useSystemMode';

const MODE_OPTIONS: ModeOption[] = [
  { 
    id: 'OFFLINE', 
    label: 'Offline (Birds)', 
    icon: '🐦‍⬛', 
    color: '#4CAF50',
    description: 'Load static bird data from local GeoJSON file'
  },
  { 
    id: 'SNAP', 
    label: 'Simulation (Snap)', 
    icon: '📸', 
    color: '#2196F3',
    description: 'Snapshot simulation with physics-based movement'
  },
  { 
    id: 'REALTIME', 
    label: 'Realtime (Israel)', 
    icon: '✈️', 
    color: '#fa0505ff',
    description: 'Live flight data from OpenSky Network API'
  }
];

const ModeSelector: React.FC = () => {
  const { currentMode, loading, error, changeMode } = useSystemMode();

  const handleModeChange = async (newMode: RunMode): Promise<void> => {
    try {
      await changeMode(newMode);
      alert(`Successfully switched to ${newMode} mode`);
    } catch (err) {
      alert(`Failed to switch mode: ${error || 'Unknown error'}`);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>
        ⚙️ Select System Mode
      </h3>
      
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={styles.buttonContainer}>
        {MODE_OPTIONS.map((mode) => (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            disabled={loading}
            style={{
              ...styles.modeButton,
              backgroundColor: currentMode === mode.id ? mode.color : '#f5f5f5ff',
              color: currentMode === mode.id ? 'white' : '#333',
              borderColor: currentMode === mode.id ? mode.color : '#ddd',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'wait' : 'pointer'
            }}
            title={mode.description}
            aria-label={`Switch to ${mode.label}`}
          >
            {mode.icon} {mode.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={styles.loadingText}>
          Switching mode...
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '30px',
    right: '20px',
    zIndex: 1000,
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '220px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  title: {
    margin: '0 0 15px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
    textAlign: 'center',
    direction: 'rtl'
  },
  error: {
    background: '#ffebee',
    color: '#c62828',
    padding: '8px',
    borderRadius: '6px',
    fontSize: '12px',
    marginBottom: '10px',
    textAlign: 'center'
  },
  buttonContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  modeButton: {
    border: '2px solid',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 400,
    transition: 'all 0.2s ease',
    direction: 'rtl',
    textAlign: 'center',
    outline: 'none'
  },
  loadingText: {
    marginTop: '10px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic'
  }
};

export default ModeSelector;