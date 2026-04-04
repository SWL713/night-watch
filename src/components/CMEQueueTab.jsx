import { useState, useMemo, useEffect } from 'react';
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

function calculateSpeed(cme) {
  if (cme.position?.velocity_current) {
    return { speed: Math.round(cme.position.velocity_current), estimated: false };
  }
  
  if (cme.properties?.speed_current) {
    return { speed: Math.round(cme.properties.speed_current), estimated: false };
  }
  
  if (cme.nasa_scorecard?.cme_analysis?.speed) {
    return { speed: Math.round(cme.nasa_scorecard.cme_analysis.speed), estimated: false };
  }
  
  if (cme.properties?.speed) {
    return { speed: Math.round(cme.properties.speed), estimated: false };
  }
  
  if (cme.source?.speed) {
    return { speed: Math.round(cme.source.speed), estimated: false };
  }
  
  const launchTime = cme.source?.launch_time ? new Date(cme.source.launch_time).getTime() : null;
  
  // Use arrival.median_prediction instead of nasa_scorecard path
  if (launchTime && cme.arrival?.median_prediction) {
    const arrivalMs = cme.arrival.median_prediction * 1000;
    const travelTimeHours = (arrivalMs - launchTime) / (1000 * 60 * 60);
    
    if (travelTimeHours > 0) {
      const distanceKm = 1.0 * 149597870.7;
      const speedKms = distanceKm / (travelTimeHours * 3600);
      return { speed: Math.round(speedKms), estimated: true };
    }
  }
  
  if (launchTime) {
    const now = Date.now();
    const elapsedHours = (now - launchTime) / (1000 * 60 * 60);
    
    if (elapsedHours > 0) {
      const distanceAU = cme.position?.distance_au || 0;
      if (distanceAU > 0) {
        const distanceKm = distanceAU * 149597870.7;
        const speedKms = distanceKm / (elapsedHours * 3600);
        return { speed: Math.round(speedKms), estimated: true };
      }
    }
  }
  
  return { speed: null, estimated: false };
}

function getETAInfo(cme) {
  // Priority 1: Backend arrival.median_prediction (scoreboard median)
  if (cme.arrival?.median_prediction) {
    const medianTime = new Date(cme.arrival.median_prediction * 1000);
    const hours = Math.round((medianTime - new Date()) / (1000 * 60 * 60));
    
    let plusMinus = null;
    if (cme.arrival.earliest_prediction && cme.arrival.latest_prediction) {
      const minTime = cme.arrival.earliest_prediction * 1000;
      const maxTime = cme.arrival.latest_prediction * 1000;
      const medianMs = medianTime.getTime();
      
      const minusDiff = Math.round((medianMs - minTime) / (1000 * 60 * 60));
      const plusDiff = Math.round((maxTime - medianMs) / (1000 * 60 * 60));
      
      plusMinus = Math.max(minusDiff, plusDiff);
    }
    
    return {
      timestamp: medianTime,
      hours: hours,
      plusMinus: plusMinus,
      source: 'scoreboard_median'
    };
  }
  
  // Priority 2: Backend arrival.average_prediction (scoreboard average)
  if (cme.arrival?.average_prediction) {
    const meanTime = new Date(cme.arrival.average_prediction * 1000);
    return {
      timestamp: meanTime,
      hours: Math.round((meanTime - new Date()) / (1000 * 60 * 60)),
      plusMinus: null,
      source: 'scoreboard_average'
    };
  }
  
  // Priority 3: Position calculator (DBM model) - LAST RESORT
  if (cme.position?.eta_hours) {
    const eta = new Date(Date.now() + cme.position.eta_hours * 3600000);
    return {
      timestamp: eta,
      hours: Math.round(cme.position.eta_hours),
      plusMinus: null,
      source: 'dbm_calc'
    };
  }
  
  return null;
}

export default function CMEQueueTab({ cmes, positions }) {
  const [selectedCME, setSelectedCME] = useState(null);
  const [cmeRegistry, setCMERegistry] = useState({});
  
  const { sortedForDisplay, registry } = useMemo(() => {
    if (!cmes || cmes.length === 0) {
      return { sortedForDisplay: [], registry: {} };
    }
    
    const newRegistry = { ...cmeRegistry };
    const usedNumbers = new Set();
    const usedColors = new Set();
    
    for (const cme of cmes) {
      if (newRegistry[cme.id]) {
        usedNumbers.add(newRegistry[cme.id].number);
        usedColors.add(newRegistry[cme.id].color);
      }
    }
    
    const cmeIds = new Set(cmes.map(c => c.id));
    for (const id in newRegistry) {
      if (!cmeIds.has(id)) {
        delete newRegistry[id];
      }
    }
    
    const sortedByLaunch = [...cmes].sort((a, b) => {
      const timeA = a.source?.launch_time ? new Date(a.source.launch_time).getTime() : 0;
      const timeB = b.source?.launch_time ? new Date(b.source.launch_time).getTime() : 0;
      return timeA - timeB;
    });
    
    let nextNumber = 1;
    for (const cme of sortedByLaunch) {
      if (!newRegistry[cme.id]) {
        while (usedNumbers.has(nextNumber)) {
          nextNumber++;
        }
        
        let colorIndex = 0;
        while (usedColors.has(CME_COLORS[colorIndex % CME_COLORS.length])) {
          colorIndex++;
          if (colorIndex >= CME_COLORS.length * 2) break;
        }
        
        const assignedColor = CME_COLORS[colorIndex % CME_COLORS.length];
        
        newRegistry[cme.id] = {
          number: nextNumber,
          color: assignedColor,
          launchTime: cme.source?.launch_time
        };
        
        usedNumbers.add(nextNumber);
        usedColors.add(assignedColor);
        nextNumber++;
      }
    }
    
    const sortedForDisplay = [...cmes].sort((a, b) => {
      const distA = a.position?.distance_au || 0;
      const distB = b.position?.distance_au || 0;
      return distB - distA;
    });
    
    return { sortedForDisplay, registry: newRegistry };
  }, [cmes, cmeRegistry]);
  
  useEffect(() => {
    setCMERegistry(registry);
  }, [registry]);

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

  const formatETATimestamp = (timestamp, plusMinus) => {
    if (!timestamp) return null;
    const dateStr = timestamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    // Make ± more prominent with color coding
    if (plusMinus && plusMinus > 0) {
      return (
        <span>
          {dateStr}
          <span style={{ 
            color: '#ffaa33', 
            fontWeight: 600, 
            marginLeft: 4 
          }}>
            ±{plusMinus}h
          </span>
        </span>
      );
    }
    return dateStr;
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
          cmes={sortedForDisplay} 
          positions={positions}
          registry={registry}
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
        {sortedForDisplay.map((cme) => {
          const assignment = registry[cme.id] || { number: 0, color: '#888' };
          const cmeNumber = assignment.number;
          const cmeColor = assignment.color;
          const speedInfo = calculateSpeed(cme);
          
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
                {cme.aurora_rating && (
                  <span style={{ fontSize: 10, color: cme.aurora_rating.stars >= 4 ? '#ffaa00' : cme.aurora_rating.stars >= 2 ? '#ffcc66' : '#667788', whiteSpace: 'nowrap', letterSpacing: 1 }}>
                    {'★'.repeat(cme.aurora_rating.stars || 0)}{'☆'.repeat(5 - (cme.aurora_rating.stars || 0))}
                    <span style={{ fontSize: 7, color: '#7a8a90', marginLeft: 2 }}>({cme.aurora_rating.confidence}%)</span>
                  </span>
                )}
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
                      {etaInfo 
                        ? `${etaInfo.hours}h${etaInfo.plusMinus ? ` ±${etaInfo.plusMinus}h` : ''}`
                        : 'N/A'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: C.textDim }}>ARRIVAL:</span>
                    <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {etaInfo ? formatETATimestamp(etaInfo.timestamp, etaInfo.plusMinus) : 'N/A'}
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
          cmeNumber={registry[selectedCME.id]?.number || 0}
          cmeColor={registry[selectedCME.id]?.color || '#888'}
          onClose={() => setSelectedCME(null)}
        />
      )}
    </div>
  );
}
