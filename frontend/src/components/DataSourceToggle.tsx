import React from 'react';
import '../styles/DataSourceToggle.css';

interface DataSourceToggleProps {
  isHistorical: boolean;
  onToggle: (historical: boolean) => void;
  connected: boolean;
  flightCount: number;
}

export const DataSourceToggle: React.FC<DataSourceToggleProps> = ({
  isHistorical,
  onToggle,
  connected,
  flightCount
}) => {
  return (
    <div className="data-source-control">
      {/* Connection Status Badge */}
      <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
        <div className="status-indicator" />
        <span className="status-text">
          {connected ? 'מחובר' : 'מנותק'}
        </span>
        {connected && (
          <span className="flight-count">
            {flightCount} טיסות
          </span>
        )}
      </div>

      {/* Data Source Toggle */}
      <div className="toggle-container">
        <span className="toggle-label">מקור הנתונים</span>
        <div className="toggle-wrapper">
          <button
            className={`toggle-option ${isHistorical ? 'active' : ''}`}
            onClick={() => onToggle(true)}
            disabled={!connected}
          >
            📊 היסטוריה
          </button>
          <button
            className={`toggle-option ${!isHistorical ? 'active' : ''}`}
            onClick={() => onToggle(false)}
            disabled={!connected}
          >
            🔴 זמן אמת
          </button>
        </div>
      </div>

      {/* Info Display */}
      <div className="info-display">
        <div className="info-item">
          <span className="info-icon">✈️</span>
          <span className="info-text">
            {isHistorical ? 'סימולציה היסטורית' : 'OpenSky Network API'}
          </span>
        </div>
        {isHistorical && (
          <div className="info-item">
            <span className="info-icon">📍</span>
            <span className="info-text">מרחב אווירי ישראלי</span>
          </div>
        )}
      </div>
    </div>
  );
};
