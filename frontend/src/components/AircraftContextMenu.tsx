import React from 'react';
import type { IFlight } from '../types/Flight.types';

interface AircraftContextMenuProps {
  x: number;
  y: number;
  aircraft: IFlight;
  hasSearchArea: boolean;
  onOpenRegularSearch: () => void;
  onOpenSmartSearch: () => void;
  onClose: () => void;
}

/**
 * תפריט קליק ימני למטוס
 * מציג אפשרויות לפתיחת אזור חיפוש רגיל או חכם
 */
export const AircraftContextMenu: React.FC<AircraftContextMenuProps> = ({
  x,
  y,
  aircraft,
  hasSearchArea,
  onOpenRegularSearch,
  onOpenSmartSearch,
  onClose
}) => {
  const handleMenuItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div 
      className="radar-menu"
      style={{
        ...styles.contextMenu,
        top: y,
        left: x
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* כותרת עם מזהה המטוס */}
      <div style={styles.menuHeader}>
        מזהה: {aircraft.flightId}
      </div>
      
      {/* אופציה: פתח אזור חיפוש רגיל */}
      <div 
        style={{
          ...styles.menuItem,
          color: hasSearchArea ? '#00ff88' : '#fff'
        }}
        className="menu-item-hover"
        onClick={() => handleMenuItemClick(onOpenRegularSearch)}
      >
        <span style={styles.checkmark}>
          {hasSearchArea ? '✓' : '○'}
        </span>
        <span>פתח אזור חיפוש רגיל</span>
      </div>

      {/* אופציה: פתח אזור חיפוש חכם (לא מומש) */}
      <div 
        style={styles.menuItem} 
        className="menu-item-hover"
        onClick={() => handleMenuItemClick(onOpenSmartSearch)}
      >
        <span style={styles.checkmark}>○</span>
        <span>פתח אזור חיפוש חכם</span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  contextMenu: {
    position: 'fixed',
    minWidth: '220px',
    backgroundColor: 'rgba(25, 25, 25, 0.95)',
    borderRadius: '8px',
    zIndex: 10000,
    direction: 'rtl',
    padding: '6px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    animation: 'menuAppear 0.1s ease-out'
  },
  menuHeader: {
    padding: '10px 12px',
    fontSize: '11px',
    color: '#666',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    marginBottom: '4px',
    fontWeight: 'bold'
  },
  menuItem: {
    padding: '12px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '4px',
    color: '#fff',
    transition: 'all 0.2s ease'
  },
  checkmark: {
    marginLeft: '10px'
  }
};
