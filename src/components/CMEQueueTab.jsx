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
  if (cme.position?.velocity_current) {
    return { speed: Math.round(cme.position.velocity_current), estimated: false };
  }
  
  if (cme.properties?.speed_current) {
    return { speed: Math.round(cme.properties.speed_current), estimated: false };
  }
  
  const launchTime = cme.source?.launch_time ? new Date(cme.source.launch_time).getTime() : null;
  if (!launchTime) return { speed: null, estimated: false };
  
  const now = Date.now();
  const elapsedHours = (now - launchTime) / (1000 * 60 * 60);
  
  if (elapsedHours <= 0) return { speed: null, estimated: false };
  
  const distanceAU = cme.position?.distance_au || 0;
  if (distanceAU <= 0) return { speed: null, estimated: false };
  
  const distanceKm = distanceAU * 149597870.7;
  const speedKms = distanceKm / (elapsedHours * 3600);
  
  return {
    speed: Math.round(speedKms),
    estimated: true
  };
}

// Get average ETA from scorecard models
function getAverageETA(cme) {
  // Try scorecard ensemble prediction first
  const ensemble = cme.nasa_scorecard?.ensemble_prediction;
  if (ensemble?.arrival_time) {
    const arrivalTime = new Date(ensemble.arrival_time);
    const now = new Date();
    const hoursUntil = (arrivalTime - now) / (1000 * 60 * 60);
    return hoursUntil > 0 ? Math.round(hoursUntil) : null;
  }
  
  // Try position eta_hours
  if (cme.position?.eta_hours) {
    return Math.round(cme.position.eta_hours);
  }
  
  // Try calculating from arrival models
  if (cme.arrival?.models && cme.arrival.models.length > 0) {
    const validETAs = cme.arrival.models
      .map(m => {
        if (!m.estimated_arrival) return null;
        const arrivalTime = new Date(m.estimated_arrival);
        const now = new Date();
        const hours = (arrivalTime - now) / (1000 * 60 * 60);
        return hours > 0 ? hours : null;
      })
      .filter(h => h !== null);
    
    if (validETAs.length > 0) {
      const avgETA = validETAs.reduce((a, b) => a + b, 0) / validETAs.length;
      return Math.round(avgETA);
    }
  }
  
  return null;
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
          
          // FIXED: Get correct model count
          const numModels = cme.arrival?.models?.length 
            || cme.nasa_scorecard?.ensemble_prediction?.num_models 
            || cme.arrival?.num_models 
            || 0;
          
          const cmeType = cme.properties?.type 
            || cme.nasa_scorecard?.cme_analysis?.type 
            || 'Unknown';
          
          const cmeWidth = cme.properties?.width 
            || cme.nasa_scorecard?.cme_analysis?.width 
            || null;
          
          // AVERAGE ETA FROM SCORECARD
          const avgETA = getAverageETA(cme);
          
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
                  background: cme.state?.current === 'WATCH' ? '#FFA500' 
                    : cme.state?.current === 'INBOUND' ? '#FF6B00'
                    : cme.state?.current === 'IMMINENT' ? '#FF0080'
                    : '#4a6a70',
                  color: cme.state?.current === 'WATCH' ? '#000' : '#fff',
                  padding: '2px 8px',
                  borderRadius: 2,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}>{cme.state?.current || 'UNKNOWN'}</span>
              </div>

              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: '12px',
                rowGap: '3px',
                fontSize: 9
              }}>
                <div style={{ display: 'contents' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>TYPE:</span>
                    <span style={{ color: C.text }}>{cmeType}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>DIST:</span>
                    <span style={{ color: C.text }}>
                      {cme.position?.distance_au?.toFixed(2) || '0.00'} AU ({cme.position?.progress_percent?.toFixed(0) || '0'}%)
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
                    <span style={{ color: C.text }}>{numModels}</span>
                  </div>
                </div>

                <div style={{ display: 'contents' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>LAUNCH:</span>
                    <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatDate(cme.source?.launch_time)}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>ETA:</span>
                    <span style={{ color: C.text }}>
                      {avgETA ? `${avgETA}h (avg)` : 'N/A'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>WIDTH:</span>
                    <span style={{ color: C.text }}>
                      {cmeWidth ? `${cmeWidth}°` : 'Unknown'}
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
