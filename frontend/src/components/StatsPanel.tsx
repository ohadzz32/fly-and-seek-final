import React, { useState } from 'react';
import '../styles/StatsPanel.css';

interface StatsPanelProps {
  connected: boolean;
  flightCount: number;
  isHistorical: boolean;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  connected,
  flightCount,
  isHistorical
}) => {
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  const togglePanel = (panelId: string) => {
    setExpandedPanel(expandedPanel === panelId ? null : panelId);
  };

  return (
    <div className="stats-panel-container">
      {/* Connection Status Panel */}
      <div 
        className={`stat-card ${expandedPanel === 'connection' ? 'expanded' : ''}`}
        onClick={() => togglePanel('connection')}
      >
        <div className="stat-icon">
          <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
        </div>
        <div className="stat-content">
          <div className="stat-label">סטטוס</div>
          <div className="stat-value">{connected ? 'מחובר' : 'מנותק'}</div>
        </div>
        {expandedPanel === 'connection' && (
          <div className="stat-details" onClick={(e) => e.stopPropagation()}>
            <div className="detail-row">
              <span>WebSocket:</span>
              <span className={connected ? 'text-success' : 'text-error'}>
                {connected ? '🟢 Active' : '🔴 Disconnected'}
              </span>
            </div>
            <div className="detail-row">
              <span>Server:</span>
              <span>localhost:3001</span>
            </div>
          </div>
        )}
      </div>

      {/* Flight Count Panel */}
      <div 
        className={`stat-card ${expandedPanel === 'flights' ? 'expanded' : ''}`}
        onClick={() => togglePanel('flights')}
      >
        <div className="stat-icon">✈️</div>
        <div className="stat-content">
          <div className="stat-label">טיסות</div>
          <div className="stat-value">{flightCount}</div>
        </div>
        {expandedPanel === 'flights' && (
          <div className="stat-details" onClick={(e) => e.stopPropagation()}>
            <div className="detail-row">
              <span>טיסות פעילות:</span>
              <span className="highlight">{flightCount}</span>
            </div>
            <div className="detail-row">
              <span>מקסימום:</span>
              <span>3,000</span>
            </div>
            <div className="detail-row">
              <span>עדכון:</span>
              <span>כל שנייה</span>
            </div>
          </div>
        )}
      </div>

      {/* Data Source Panel */}
      <div 
        className={`stat-card ${expandedPanel === 'source' ? 'expanded' : ''}`}
        onClick={() => togglePanel('source')}
      >
        <div className="stat-icon">📊</div>
        <div className="stat-content">
          <div className="stat-label">מקור</div>
          <div className="stat-value">{isHistorical ? 'היסטוריה' : 'זמן אמת'}</div>
        </div>
        {expandedPanel === 'source' && (
          <div className="stat-details" onClick={(e) => e.stopPropagation()}>
            <div className="detail-row">
              <span>טיפוס:</span>
              <span>{isHistorical ? 'סימולציה' : 'OpenSky API'}</span>
            </div>
            <div className="detail-row">
              <span>כיסוי:</span>
              <span>🌍 עולמי + 🇮🇱 ישראל</span>
            </div>
            {isHistorical && (
              <div className="detail-row">
                <span>תנועה:</span>
                <span className="text-success">✓ פעילה</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map Controls Panel */}
      <div 
        className={`stat-card ${expandedPanel === 'controls' ? 'expanded' : ''}`}
        onClick={() => togglePanel('controls')}
      >
        <div className="stat-icon">🗺️</div>
        <div className="stat-content">
          <div className="stat-label">בקרות</div>
          <div className="stat-value">מפה</div>
        </div>
        {expandedPanel === 'controls' && (
          <div className="stat-details" onClick={(e) => e.stopPropagation()}>
            <div className="detail-row">
              <span>ימני:</span>
              <span>פתח תפריט</span>
            </div>
            <div className="detail-row">
              <span>גלגלת:</span>
              <span>זום</span>
            </div>
            <div className="detail-row">
              <span>גרירה:</span>
              <span>הזזת מפה</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
