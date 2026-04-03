import { useState } from 'react';
import CMEPositionViz from './CMEPositionViz';
import CMEDetailPopup from './CMEDetailPopup';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  border: '#0d1525',
  cardBg: '#060810',
  textDim: '#44ddaa',  // BRIGHTER
  text: '#e0e6ed',     // BRIGHT
};

const CME_COLORS = [
  '#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', 
  '#FF0080', '#0080FF', '#FF8000', '#80FF00',
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
      {/* Top - Position Visualization (fixed height to preserve aspect ratio) */}
      <div style={{ 
        flexShrink: 0,
        height: 140,
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
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
        gap: 8
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
                padding: '8px 12px',
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
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 10,
                marginBottom: 6,
                paddingBottom: 6,
                borderBottom: `1px solid ${C.border}`
              }}>
                <span style={{ 
                  color: cmeColor, 
                  fontSize: 18, 
                  fontWeight: 'bold',
                  minWidth: 24
                }}>
                  {idx + 1}
                </span>
                <span style={{ 
                  color: C.textDim, 
                  fontSize: 9, 
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
                  padding: '3px 10px',
                  borderRadius: 3,
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}>
                  {cme.state.current}
                </span>
              </div>

              {/* Details - NO progress bars, ALL info */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 5,
                fontSize: 10
              }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>TYPE:</span>
                  <span style={{ color: C.text }}>{cme.properties.type || 'Unknown'}</span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>LAUNCH:</span>
                  <span style={{ color: C.text }}>{formatDate(cme.source.launch_time)}</span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>DISTANCE:</span>
                  <span style={{ color: C.text }}>
                    {cme.position.distance_au.toFixed(3)} AU 
                    ({cme.position.progress_percent.toFixed(1)}%)
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>ETA:</span>
                  <span style={{ color: C.text }}>
                    {cme.position.eta_hours ? `${Math.round(cme.position.eta_hours)}h` : 'N/A'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>SPEED:</span>
                  <span style={{ color: C.text }}>
                    {cme.properties.speed_current 
                      ? `${Math.round(cme.properties.speed_current)} km/s`
                      : 'Unknown'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>WIDTH:</span>
                  <span style={{ color: C.text }}>
                    {cme.properties.width ? `${cme.properties.width}°` : 'Unknown'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.textDim, minWidth: 70 }}>MODELS:</span>
                  <span style={{ color: C.text }}>{cme.arrival.num_models}</span>
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
