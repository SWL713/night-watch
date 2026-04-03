import { useState } from 'react';
import CMEPositionViz from './CMEPositionViz';
import CMEDetailPopup from './CMEDetailPopup';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  border: '#0d1525',
  cardBg: '#060810',
  textDim: '#44ddaa',
  text: '#e0e6ed',
};

const CME_COLORS = ['#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', '#FF0080', '#0080FF', '#FF8000', '#80FF00'];

function calculateEstimatedSpeed(cme) {
  if (cme.properties.speed_current) {
    return { speed: Math.round(cme.properties.speed_current), estimated: false };
  }
  
  const launchTime = new Date(cme.source.launch_time).getTime();
  const now = Date.now();
  const elapsedHours = (now - launchTime) / (1000 * 60 * 60);
  
  if (elapsedHours <= 0) return { speed: null, estimated: false };
  
  const distanceKm = cme.position.distance_au * 149597870.7;
  const speedKms = distanceKm / (elapsedHours * 3600);
  
  return { speed: Math.round(speedKms), estimated: true };
}

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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11 }}>
        No active CMEs currently tracked
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Visualization - Fixed at top */}
      <div style={{ 
        flexShrink: 0,
        height: 200,
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        padding: '10px',
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

      {/* CME Cards - 2-COLUMN LAYOUT */}
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
          const speedInfo = calculateEstimatedSpeed(cme);
          
          return (
            <div
              key={cme.id}
              onClick={() => setSelectedCME(cme)}
              style={{
                background: C.cardBg,
                border: `1px solid ${cmeColor}`,
                borderRadius: 3,
                padding: '6px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 10px ${cmeColor}88`;
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
                gap: 8,
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: `1px solid ${C.border}`
              }}>
                <span style={{ color: cmeColor, fontSize: 16, fontWeight: 'bold', minWidth: 20 }}>{idx + 1}</span>
                <span style={{ color: C.textDim, fontSize: 8, fontFamily: FONT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cme.id}</span>
                <span style={{
                  background: cme.state.current === 'WATCH' ? '#FFA500' 
                    : cme.state.current === 'INBOUND' ? '#FF6B00'
                    : cme.state.current === 'IMMINENT' ? '#FF0080'
                    : '#4a6a70',
                  color: cme.state.current === 'WATCH' ? '#000' : '#fff',
                  padding: '2px 8px',
                  borderRadius: 2,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}>{cme.state.current}</span>
              </div>

              {/* 2-COLUMN GRID LAYOUT */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: '12px',
                rowGap: '3px',
                fontSize: 9
              }}>
                {/* Left column */}
                <div style={{ display: 'contents' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>TYPE:</span>
                    <span style={{ color: C.text }}>{cme.properties.type || 'Unknown'}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>DIST:</span>
                    <span style={{ color: C.text }}>
                      {cme.position.distance_au.toFixed(2)} AU ({cme.position.progress_percent.toFixed(0)}%)
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>SPEED:</span>
                    <span style={{ color: C.text }}>
                      {speedInfo.speed 
                        ? `${speedInfo.speed} km/s${speedInfo.estimated ? ' (est)' : ''}`
                        : 'Unknown'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>MODELS:</span>
                    <span style={{ color: C.text }}>{cme.arrival.num_models}</span>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'contents' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>LAUNCH:</span>
                    <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatDate(cme.source.launch_time)}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>ETA:</span>
                    <span style={{ color: C.text }}>
                      {cme.position.eta_hours ? `${Math.round(cme.position.eta_hours)}h` : 'N/A'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>WIDTH:</span>
                    <span style={{ color: C.text }}>
                      {cme.properties.width ? `${cme.properties.width}°` : 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
