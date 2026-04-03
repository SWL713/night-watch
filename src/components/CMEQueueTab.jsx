import { useState } from 'react';
import CMEPositionViz from './CMEPositionViz';
import CMEDetailPopup from './CMEDetailPopup';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  border: '#0d1525',
  cardBg: '#060810',
  textDim: '#1a2a3a',
  text: '#2a4a5a',
};

// Neon colors for each CME
const CME_COLORS = [
  '#00FFF0', // Cyan
  '#FF00FF', // Magenta
  '#00FF00', // Green
  '#FFFF00', // Yellow
  '#FF0080', // Pink
  '#0080FF', // Blue
  '#FF8000', // Orange
  '#80FF00', // Lime
];

export default function CMEQueueTab({ cmes, positions }) {
  const [selectedCME, setSelectedCME] = useState(null);

  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatETA = (hours) => {
    if (!hours) return 'N/A';
    return `${Math.round(hours)}h`;
  };

  if (cmes.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.text,
        fontSize: 11
      }}>
        No active CMEs currently tracked
      </div>
    );
  }

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden' 
    }}>
      {/* Top - Position Visualization (no legend!) */}
      <div style={{ 
        flexShrink: 0,
        height: 140,
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        padding: '8px',
      }}>
        <CMEPositionViz 
          cmes={cmes} 
          positions={positions}
          cmeColors={CME_COLORS}
          onCMEClick={setSelectedCME}
        />
      </div>

      {/* Bottom - CME Cards (scrollable) */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        {cmes.map((cme, idx) => {
          const cmeColor = CME_COLORS[idx % CME_COLORS.length];
          
          return (
            <div
              key={cme.id}
              onClick={() => setSelectedCME(cme)}
              style={{
                background: C.cardBg,
                border: `1px solid ${cmeColor}`,
                borderRadius: 4,
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 12px ${cmeColor}88`;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {/* Header row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: `1px solid ${C.border}`
              }}>
                <span style={{ 
                  color: cmeColor, 
                  fontSize: 16, 
                  fontWeight: 'bold',
                  minWidth: 20
                }}>
                  {idx + 1}
                </span>
                <span style={{ 
                  color: C.textDim, 
                  fontSize: 8, 
                  fontFamily: FONT,
                  flex: 1
                }}>
                  {cme.id}
                </span>
                <span style={{
                  background: cme.state.current === 'WATCH' ? '#FFA500' 
                    : cme.state.current === 'INBOUND' ? '#FF6B00'
                    : cme.state.current === 'IMMINENT' ? '#FF0080'
                    : '#4a6a70',
                  color: cme.state.current === 'WATCH' ? '#000' : '#fff',
                  padding: '2px 8px',
                  borderRadius: 3,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  boxShadow: cme.state.current === 'WATCH' ? '0 0 8px #FFA50066' : 'none'
                }}>
                  {cme.state.current}
                </span>
              </div>

              {/* Details */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 3,
                fontSize: 8
              }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: C.textDim }}>TYPE:</span>
                  <span style={{ color: '#e0e6ed' }}>{cme.properties.type || 'Unknown'}</span>
                  <span style={{ color: C.textDim, marginLeft: 'auto' }}>ETA:</span>
                  <span style={{ color: '#e0e6ed' }}>{formatETA(cme.position.eta_hours)}</span>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: C.textDim }}>LAUNCH:</span>
                  <span style={{ color: '#e0e6ed' }}>{formatDate(cme.source.launch_time)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.textDim }}>PROGRESS:</span>
                  <div style={{ 
                    flex: 1, 
                    height: 8, 
                    background: '#0a0e1a', 
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${cme.position.progress_percent}%`,
                      background: `linear-gradient(90deg, ${cmeColor}88 0%, ${cmeColor} 100%)`,
                      borderRadius: 4,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                  <span style={{ color: C.textDim, fontSize: 7 }}>
                    {cme.position.progress_percent.toFixed(1)}% ({cme.position.distance_au.toFixed(2)} AU)
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: C.textDim }}>SPEED:</span>
                  <span style={{ color: '#e0e6ed' }}>
                    {cme.properties.speed_current 
                      ? `${Math.round(cme.properties.speed_current)} km/s`
                      : 'Unknown'}
                  </span>
                  <span style={{ color: C.textDim, marginLeft: 'auto' }}>MODELS:</span>
                  <span style={{ color: '#e0e6ed' }}>{cme.arrival.num_models}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Popup */}
      {selectedCME && (
        <CMEDetailPopup
          cme={selectedCME}
          cmeNumber={cmes.findIndex(c => c.id === selectedCME.id) + 1}
          cmeColor={CME_COLORS[cmes.findIndex(c => c.id === selectedCME.id) % CME_COLORS.length]}
          onClose={() => setSelectedCME(null)}
        />
      )}
    </div>
  );
}
