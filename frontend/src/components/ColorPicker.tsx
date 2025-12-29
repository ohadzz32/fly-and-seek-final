import React from 'react';
import type { ColorOption } from '../types/Flight.types';
import { COLOR_OPTIONS } from '../constants/mapConfig';

interface ColorPickerProps {
  onColorSelect: (color: string) => void;
  onCancel: () => void;
  flightId: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  onColorSelect,
  onCancel,
  flightId
}) => {
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Flight: {flightId}</h3>
      
      <div style={styles.colorGrid}>
        {COLOR_OPTIONS.map((colorOption: ColorOption) => (
          <button
            key={colorOption.hex}
            onClick={() => onColorSelect(colorOption.hex)}
            style={{
              ...styles.colorButton,
              backgroundColor: colorOption.hex
            }}
            title={colorOption.name}
            aria-label={`Select ${colorOption.name} color`}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          />
        ))}
      </div>
      
      <button onClick={onCancel} style={styles.cancelButton}>
        Cancel
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0, 0, 0, 0.9)',
    color: 'white',
    padding: '20px',
    borderRadius: '16px',
    border: '1px solid #555',
    zIndex: 1001,
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
  },
  title: {
    margin: '0 0 15px 0',
    textAlign: 'center',
    fontSize: '16px',
    fontWeight: 600
  },
  colorGrid: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    marginBottom: '15px'
  },
  colorButton: {
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    border: '2px solid white',
    cursor: 'pointer',
    transition: 'transform 0.2s',
    outline: 'none'
  },
  cancelButton: {
    width: '100%',
    padding: '8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: 'none',
    background: '#444',
    color: 'white',
    fontSize: '14px',
    transition: 'background 0.2s'
  }
};
