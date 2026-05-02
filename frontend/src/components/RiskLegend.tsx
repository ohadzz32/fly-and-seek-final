import React from 'react';

export function RiskLegend() {
  return (
    <div style={styles.legendContainer}>
      <h3 style={styles.legendTitle}>מפת סיכונים</h3>
      <div style={styles.legendItem}>
        <div style={{ ...styles.colorBox, backgroundColor: '#FF4500' }} />
        <span style={styles.legendLabel}>אזור מסוכן</span>
      </div>
      <div style={styles.legendItem}>
        <div style={{ ...styles.colorBox, backgroundColor: '#FFA500' }} />
        <span style={styles.legendLabel}>אזור פוטנציאלי לסכנה</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  legendContainer: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '12px',
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    zIndex: 10,
    minWidth: '200px',
    direction: 'rtl'
  },
  legendTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    paddingBottom: '6px'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px'
  },
  colorBox: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    marginLeft: '10px'
  },
  legendLabel: {
    fontSize: '13px'
  }
};


