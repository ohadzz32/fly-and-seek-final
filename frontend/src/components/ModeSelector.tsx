import { useState, useEffect } from 'react';

type RunMode = 'OFFLINE' | 'REALTIME' | 'SNAP';

אעע
const ModeSelector = () => {
  const [currentMode, setCurrentMode] = useState<RunMode>('OFFLINE');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3001/api/config/mode')
      .then(res => res.json())
      .then(data => setCurrentMode(data.mode))
      .catch(err => console.error('Failed to fetch mode:', err));
  }, []);

  const handleModeChange = async (newMode: RunMode) => {
    if (newMode === currentMode || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/config/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentMode(newMode);
        console.log(`Mode is switched to successfully: ${newMode}`);
        alert(`the system is switched to ${newMode}`);
      } else {
        console.error('Server error:', data);
        alert(`error: ${data.error || 'Failed to switch mode'}`);
      }
    } catch (error) {
      console.error('Error changing mode:', error);
      alert('error changing mode. See more details in console.');
    } finally {
      setIsLoading(false);
    }
  };

  const modes: Array<{ id: RunMode; label: string; icon: string; color: string }> = [
    { id: 'OFFLINE', label: 'Offline (Birds)', icon: '🐦‍⬛', color: '#4CAF50' },
    { id: 'SNAP', label: 'Simulation (Snap)', icon: '📸', color: '#2196F3' },
    { id: 'REALTIME', label: 'Realtime (Israel)', icon: '✈️', color: '#fa0505ff' }
  ];

  return (
    <div style={{
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
    }}>
      <h3 style={{ 
        margin: '0 0 15px 0', 
        fontSize: '16px', 
        fontWeight: 600,
        color: '#333',
        textAlign: 'center',
        direction: 'rtl'
      }}>
        ⚙️ Select System Mode
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {modes.map(mode => (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            disabled={isLoading}
            style={{
              backgroundColor: currentMode === mode.id ? mode.color : '#f5f5f5ff',
              color: currentMode === mode.id ? 'white' : '#333',
              border: currentMode === mode.id ? `2px solid ${mode.color}` : '2px solid #ddd',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: isLoading ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: currentMode === mode.id ? 600 : 400,
              transition: 'all 0.2s ease',
              direction: 'rtl',
              textAlign: 'center',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {mode.icon} {mode.label}
          </button>
        ))}
      </div>

      <div style={{
        marginTop: '15px',
        padding: '10px',
        background: '#000000ff',
        borderRadius: '6px',
        fontSize: '12px',
        textAlign: 'center',
        color: '#fcfcfcff',
        direction: 'rtl'
      }}>
        Current Mode: <strong>{currentMode}</strong>
      </div>
    </div>
  );
};

export default ModeSelector;