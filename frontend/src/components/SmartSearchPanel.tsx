import React, { useState, useEffect } from 'react';
import type { SmartSearchState } from '../types/Flight.types';

const BUFFER_REQUIRED = 30;
const SECONDS_PER_SAMPLE = 10;

const formatCountdown = (seconds: number): string => {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface SmartSearchPanelProps {
  smartSearch: SmartSearchState;
  isServerOnline: boolean;
  onActivate: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export const SmartSearchPanel: React.FC<SmartSearchPanelProps> = ({
  smartSearch,
  isServerOnline,
  onActivate,
  onStop,
  onCancel,
}) => {
  const bufferPercent = Math.min(
    100,
    Math.round((smartSearch.bufferProgress / BUFFER_REQUIRED) * 100)
  );

  // ── Dynamic countdown timer ──
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!smartSearch.isBuffering) {
      setCountdown(0);
      return;
    }

    // Reset countdown based on actual progress
    const remaining = Math.max(
      0,
      (BUFFER_REQUIRED - smartSearch.bufferProgress) * SECONDS_PER_SAMPLE
    );
    setCountdown(remaining);

    // Tick down every second for a smooth display
    const id = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(id);
  }, [smartSearch.isBuffering, smartSearch.bufferProgress]);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>🧠</span>
        <span style={styles.headerText}>אזור חיפוש חכם</span>
        <button style={styles.closeBtn} onClick={onCancel} title="סגור">✕</button>
      </div>

      {/* Flight ID */}
      <div style={styles.flightId}>
        מזהה טיסה: <strong>{smartSearch.flightId}</strong>
      </div>

      {/* ── Buffering phase ── */}
      {smartSearch.isBuffering && (
        <div style={styles.section}>
          <div style={styles.statusLabel}>
            <span style={styles.loadingDot} />
            טוען זיכרון נתונים...
          </div>

          {/* Progress bar */}
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${bufferPercent}%`,
              }}
            />
          </div>
          <div style={styles.progressText}>
            {smartSearch.bufferProgress} / {BUFFER_REQUIRED} דגימות
            ({bufferPercent}%)
          </div>

          {/* Countdown timer */}
          <div style={styles.countdownRow}>
            <span style={styles.countdownIcon}>⏱</span>
            <span style={styles.countdownValue}>{formatCountdown(countdown)}</span>
            <span style={styles.countdownLabel}>נותרו</span>
          </div>

          {/* Server offline warning */}
          {!isServerOnline && smartSearch.bufferProgress === 0 && (
            <div style={styles.serverWarning}>
              ⚠ ממתין לחיבור לשרת חיזוי...
            </div>
          )}
        </div>
      )}

      {/* ── Buffer ready, not yet predicting ── */}
      {!smartSearch.isBuffering && !smartSearch.isPredicting && (
        <div style={styles.section}>
          <div style={{ ...styles.statusLabel, color: '#00ff88' }}>
            ✓ הזיכרון מלא — מוכן לחיזוי
          </div>
          <button style={styles.primaryBtn} onClick={onActivate}>
            ▶ הפעל חיזוי רקורסיבי
          </button>
        </div>
      )}

      {/* ── Predicting phase ── */}
      {smartSearch.isPredicting && (
        <div style={styles.section}>
          <div style={{ ...styles.statusLabel, color: '#ff6b6b' }}>
            <span style={styles.pulseDot} />
            חיזוי פעיל — צעד #{smartSearch.totalSteps}
          </div>

          {/* Drift display */}
          <div style={styles.driftContainer}>
            <span style={styles.driftLabel}>סטייה נוכחית:</span>
            <span style={styles.driftValue}>
              {smartSearch.driftMeters < 1000
                ? `${Math.round(smartSearch.driftMeters)} m`
                : `${(smartSearch.driftMeters / 1000).toFixed(2)} km`}
            </span>
          </div>

          {/* Predicted position */}
          {smartSearch.predictedPosition && (
            <div style={styles.coordsBox}>
              <div style={styles.coordLine}>
                <span style={{ color: '#ff4444' }}>🔴 חזוי:</span>{' '}
                {smartSearch.predictedPosition.latitude.toFixed(5)},{' '}
                {smartSearch.predictedPosition.longitude.toFixed(5)}
              </div>
              {smartSearch.actualPosition && (
                <div style={styles.coordLine}>
                  <span style={{ color: '#4488ff' }}>🔵 אמיתי:</span>{' '}
                  {smartSearch.actualPosition.latitude.toFixed(5)},{' '}
                  {smartSearch.actualPosition.longitude.toFixed(5)}
                </div>
              )}
            </div>
          )}

          <button style={styles.stopBtn} onClick={onStop}>
            ■ עצור חיזוי / הצג תוצאה
          </button>
        </div>
      )}

      {/* ── Results (stopped after predicting) ── */}
      {!smartSearch.isBuffering &&
        !smartSearch.isPredicting &&
        smartSearch.totalSteps > 0 && (
          <div style={styles.section}>
            <div style={{ ...styles.statusLabel, color: '#ffcc00' }}>
              📊 סיכום חיזוי
            </div>
            <div style={styles.resultRow}>
              סה״כ צעדים: <strong>{smartSearch.totalSteps}</strong>
            </div>
            <div style={styles.resultRow}>
              סטייה סופית:{' '}
              <strong>
                {smartSearch.driftMeters < 1000
                  ? `${Math.round(smartSearch.driftMeters)} m`
                  : `${(smartSearch.driftMeters / 1000).toFixed(2)} km`}
              </strong>
            </div>
            <button style={styles.secondaryBtn} onClick={onCancel}>
              סגור
            </button>
          </div>
        )}
    </div>
  );
};


// ─── Styles ───

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    bottom: 20,
    left: 20,
    width: 320,
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    borderRadius: 12,
    padding: 16,
    zIndex: 10001,
    direction: 'rtl',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(16px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  headerIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 6px',
    borderRadius: 4,
  },
  flightId: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 12,
  },
  section: {
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 13,
    color: '#ccc',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  loadingDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: '#ffcc00',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  pulseDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: '#ff4444',
    animation: 'pulse 0.8s ease-in-out infinite',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: '#555',
  },
  countdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    backgroundColor: 'rgba(255,204,0,0.08)',
    borderRadius: 6,
    marginTop: 8,
    border: '1px solid rgba(255,204,0,0.15)',
  },
  countdownIcon: {
    fontSize: 14,
  },
  countdownValue: {
    fontSize: 18,
    fontWeight: 700,
    color: '#ffcc00',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'system-ui, monospace',
  },
  countdownLabel: {
    fontSize: 12,
    color: '#999',
  },
  serverWarning: {
    fontSize: 12,
    color: '#ff8800',
    marginTop: 8,
    padding: '6px 10px',
    backgroundColor: 'rgba(255,136,0,0.08)',
    borderRadius: 6,
    border: '1px solid rgba(255,136,0,0.15)',
    textAlign: 'center' as const,
  },
  driftContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '8px 12px',
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: 8,
    marginBottom: 10,
    border: '1px solid rgba(255,68,68,0.2)',
  },
  driftLabel: {
    fontSize: 13,
    color: '#ccc',
  },
  driftValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#ff6b6b',
    fontVariantNumeric: 'tabular-nums',
  },
  coordsBox: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10,
    lineHeight: 1.6,
  },
  coordLine: {
    paddingRight: 4,
  },
  primaryBtn: {
    width: '100%',
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#00cc6a',
    color: '#000',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  stopBtn: {
    width: '100%',
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#ff4444',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  secondaryBtn: {
    width: '100%',
    padding: '8px 0',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#ccc',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 6,
  },
  resultRow: {
    fontSize: 13,
    color: '#ccc',
    marginBottom: 6,
  },
};
