import { useState, useMemo } from 'react';
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

// Get ETA timestamp - use MEDIAN (more scientifically robust)
function getETAInfo(cme) {
  // Try scorecard median first (most robust)
  const ensemble = cme.nasa_scorecard?.ensemble_prediction;
  if (ensemble?.median_arrival_time) {
    return {
      timestamp: new Date(ensemble.median_arrival_time),
      hours: Math.round((new Date(ensemble.median_arrival_time) - new Date()) / (1000 * 60 * 60)),
      source: 'median'
    };
  }
  
  // Try mean as fallback
  if (ensemble?.arrival_time) {
    return {
      timestamp: new Date(ensemble.arrival_time),
      hours: Math.round((new Date(ensemble.arrival_time) - new Date()) / (1000 * 60 * 60)),
      source: 'mean'
    };
  }
  
  // Calculate from position
  if (cme.position?.eta_hours) {
    const eta = new Date(Date.now() + cme.position.eta_hours * 3600000);
    return {
      timestamp: eta,
      hours: Math.round(cme.position.eta_hours),
      source: 'calc'
    };
  }
  
  return null;
}

export default function CMEQueueTab({ cmes, positions }) {
  const [selectedCME, setSelectedCME] = useState(null);

  // SORT BY DISTANCE (nearest to Earth first), but keep original indices for numbering
  const sortedCMEsWithIndices = useMemo(() => {
    return cmes
      .map((cme, originalIndex) => ({ cme, originalIndex }))
      .sort((a, b) => {
        const distA = a.cme.position?.distance_au || 999;
        const distB = b.cme.position?.distance_au || 999;
        return distA - distB;
      });
  }, [cmes]);

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

  const formatETATimestamp = (timestamp) => {
    if (!timestamp) return null;
    return timestamp.toLocaleDateString('en-US', {
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
        {sortedCMEsWithIndices.map(({ cme, originalIndex }) => {
          const cmeNumber = originalIndex + 1; // Number by launch order
          const cmeColor = CME_COLORS[originalIndex % CME_COLORS.length];
          const speedInfo = calculateEstimatedSpeed(cme);
          
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
          
          const etaInfo = getETAInfo(cme);
          
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
                <span style={{ color: cmeColor, fontSize: 16, fontWeight: 'bold', minWidth: 20 }}>{cmeNumber}</span>
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
                      {etaInfo ? `${etaInfo.hours}h` : 'N/A'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>ARRIVAL:</span>
                    <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {etaInfo ? formatETATimestamp(etaInfo.timestamp) : 'N/A'}
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
