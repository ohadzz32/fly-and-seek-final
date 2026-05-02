import React from 'react';

interface RiskMapToggleProps {
  showRiskMap: boolean;
  onToggle: (val: boolean) => void;
}

export function RiskMapToggle({ showRiskMap, onToggle }: RiskMapToggleProps) {
  return (
    <div style={styles.container} onClick={() => onToggle(!showRiskMap)}>
      <div style={{ ...styles.switch, backgroundColor: showRiskMap ? '#FF3B30' : '#333' }}>
        <div style={{ ...styles.knob, transform: showRiskMap ? 'translateX(-20px)' : 'translateX(0)' }} />
      </div>
      <span style={styles.text}>
        {showRiskMap ? 'מפת סיכונים פעילה' : 'מפת סיכונים'}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '80px',
    left: '20px',
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    zIndex: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    direction: 'rtl'
  },
  switch: {
    width: '40px',
    height: '20px',
    borderRadius: '10px',
    position: 'relative',
    transition: 'background-color 0.3s',
  },
  knob: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    position: 'absolute',
    top: '2px',
    right: '2px',
    transition: 'transform 0.3s',
  },
  text: {
    fontSize: '14px',
    fontWeight: 'bold',
    userSelect: 'none'
  }
};

