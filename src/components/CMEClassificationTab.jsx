import { useState, useEffect } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  plotBg: '#04060d',
  border: '#0d1525',
  grid: 'rgba(30,45,70,0.6)',
  zero: 'rgba(60,90,120,0.5)',
  text: '#e0e6ed',
  textDim: '#44ddaa',
  bz: '#44ddaa',
  by: '#4488ff',
  phi: '#44aaff',
};

const CME_COLORS = [
  '#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', 
  '#FF0080', '#0080FF', '#FF8000', '#80FF00',
];

// Toggle button styled like Space Weather panel
function Toggle({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: `1px solid ${active ? color : '#1a2a3a'}`,
        color: active ? color : '#2a4a5a',
        padding: '2px 8px',
        fontSize: 8,
        fontFamily: FONT,
        cursor: 'pointer',
        borderRadius: 2,
        letterSpacing: 0.5,
        fontWeight: active ? 700 : 400,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [magData, setMagData] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedCMEIndex, setSelectedCMEIndex] = useState(0);

  useEffect(() => {
    const fetchMagData = async () => {
      try {
        console.log('Fetching space weather data...');
        const response = await fetch(`/night-watch/data/space_weather.json?t=${Date.now()}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Space weather data:', data);
        
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        
        if (!data.l1 || !data.l1.history) {
          throw new Error('No l1.history in data');
        }
        
        const recentData = data.l1.history
          .filter(point => {
            const t = new Date(point.time_tag).getTime();
            return t > last24h && point.bz_gsm != null && point.by_gsm != null;
          })
          .map(point => ({
            time: new Date(point.time_tag),
            bz: point.bz_gsm,
            by: point.by_gsm,
            phi: Math.atan2(point.by_gsm, point.bz_gsm) * (180 / Math.PI)
          }));
        
        console.log(`Loaded ${recentData.length} data points`);
        setMagData(recentData);
        setLoadError(null);
      } catch (err) {
        console.error('Error loading mag data:', err);
        setLoadError(err.message);
      }
    };

    fetchMagData();
    const interval = setInterval(fetchMagData, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderBzByPlot = () => {
    if (loadError) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 160,
          color: '#ff4444',
          fontSize: 9
        }}>
          Error: {loadError}
        </div>
      );
    }

    if (magData.length === 0) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 160,
          color: C.textDim,
          fontSize: 9
        }}>
          Loading magnetic field data...
        </div>
      );
    }

    const width = 800;
    const height = 160;
    const padL = 40, padR = 10, padT = 10, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const allVals = magData.flatMap(d => [d.bz, d.by]).filter(v => v != null);
    const minVal = Math.min(...allVals, -10);
    const maxVal = Math.max(...allVals, 10);

    const scaleY = (v) => {
      const norm = (v - minVal) / (maxVal - minVal);
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (idx) => {
      return padL + (idx / (magData.length - 1)) * plotWidth;
    };

    const bzPoints = [];
    const byPoints = [];
    
    magData.forEach((d, i) => {
      if (d.bz != null) bzPoints.push(`${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.bz)}`);
      if (d.by != null) byPoints.push(`${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.by)}`);
    });

    const bzPath = bzPoints.join(' ');
    const byPath = byPoints.join(' ');

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4 }}>
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        {showBz && bzPath && <path d={bzPath} fill="none" stroke={C.bz} strokeWidth="2" />}
        {showBy && byPath && <path d={byPath} fill="none" stroke={C.by} strokeWidth="2" />}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <text x={padL - 28} y={scaleY(maxVal)} fill={C.textDim} fontSize="9" fontFamily={FONT}>{maxVal.toFixed(0)}</text>
        <text x={padL - 28} y={scaleY(0)} fill={C.textDim} fontSize="9" fontFamily={FONT}>0</text>
        <text x={padL - 28} y={scaleY(minVal)} fill={C.textDim} fontSize="9" fontFamily={FONT}>{minVal.toFixed(0)}</text>
        <text x={padL - 32} y={height / 2} fill={C.textDim} fontSize="10" fontFamily={FONT} transform={`rotate(-90 ${padL - 32} ${height / 2})`}>nT</text>
        <text x={width / 2} y={height - 4} fill={C.textDim} fontSize="9" fontFamily={FONT} textAnchor="middle">Last 24 Hours</text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (loadError || magData.length === 0) {
      return null;
    }

    const width = 800;
    const height = 120;
    const padL = 40, padR = 10, padT = 10, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const scaleY = (angle) => {
      const norm = (angle + 180) / 360;
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (idx) => {
      return padL + (idx / (magData.length - 1)) * plotWidth;
    };

    const phiPoints = [];
    magData.forEach((d, i) => {
      if (d.phi != null) phiPoints.push(`${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.phi)}`);
    });

    const phiPath = phiPoints.join(' ');

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4 }}>
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        <line x1={padL} y1={scaleY(90)} x2={width - padR} y2={scaleY(90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padL} y1={scaleY(-90)} x2={width - padR} y2={scaleY(-90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        {phiPath && <path d={phiPath} fill="none" stroke={C.phi} strokeWidth="2" />}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} />
        <text x={padL - 28} y={scaleY(180)} fill={C.textDim} fontSize="9" fontFamily={FONT}>180°</text>
        <text x={padL - 28} y={scaleY(0)} fill={C.textDim} fontSize="9" fontFamily={FONT}>0°</text>
        <text x={padL - 28} y={scaleY(-180)} fill={C.textDim} fontSize="9" fontFamily={FONT}>-180°</text>
        <text x={padL - 32} y={height / 2} fill={C.textDim} fontSize="10" fontFamily={FONT} transform={`rotate(-90 ${padL - 32} ${height / 2})`}>Phi (deg)</text>
      </svg>
    );
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
        No active CMEs to classify
      </div>
    );
  }

  const selectedCME = cmes[selectedCMEIndex];
  const selectedColor = CME_COLORS[selectedCMEIndex % CME_COLORS.length];
  const classification = classifications[selectedCME.id];

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'auto',
      padding: '8px'
    }}>
      {/* Bz/By Plot */}
      <div style={{ 
        background: C.bg, 
        border: `1px solid ${C.border}`, 
        borderRadius: 4, 
        padding: '8px',
        marginBottom: 8,
        flexShrink: 0
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>
            MAGNETIC FIELD (nT)
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Toggle label="Bz" active={showBz} color={C.bz} onClick={() => setShowBz(v => !v)} />
            <Toggle label="By" active={showBy} color={C.by} onClick={() => setShowBy(v => !v)} />
          </div>
        </div>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          {renderBzByPlot()}
        </div>
      </div>

      {/* Phi Plot */}
      {magData.length > 0 && (
        <div style={{ 
          background: C.bg, 
          border: `1px solid ${C.border}`, 
          borderRadius: 4, 
          padding: '8px',
          marginBottom: 8,
          flexShrink: 0
        }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>
              IMF PHI GSM (°)
            </span>
          </div>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            {renderPhiPlot()}
          </div>
        </div>
      )}

      {/* Classification Details - FILL REMAINING SPACE */}
      <div style={{ 
        flex: 1,
        background: C.bg, 
        border: `2px solid ${selectedColor}`, 
        borderRadius: 4, 
        padding: '10px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${C.border}`
        }}>
          <span style={{ color: selectedColor, fontSize: 18, fontWeight: 'bold' }}>
            {selectedCMEIndex + 1}
          </span>
          <span style={{ color: C.textDim, fontSize: 9, fontFamily: FONT, flex: 1 }}>
            {selectedCME.id}
          </span>
          <span style={{
            background: selectedCME.state.current === 'WATCH' ? '#FFA500' : '#4a6a70',
            color: selectedCME.state.current === 'WATCH' ? '#000' : '#fff',
            padding: '3px 10px',
            borderRadius: 3,
            fontSize: 8,
            fontWeight: 700
          }}>
            {selectedCME.state.current}
          </span>
        </div>

        {classification ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.textDim, minWidth: 140 }}>BOTHMER-SCHWENN:</span>
              <span style={{ color: C.text }}>{classification.bs_type || 'Pending'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.textDim, minWidth: 140 }}>CONFIDENCE:</span>
              <span style={{ color: C.text }}>
                {classification.confidence ? `${classification.confidence}%` : 'Pending'}
              </span>
            </div>
            {classification.window_start && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: C.textDim, minWidth: 140 }}>WINDOW:</span>
                <span style={{ color: C.text, fontSize: 9 }}>
                  {new Date(classification.window_start).toLocaleString()} - 
                  {new Date(classification.window_end).toLocaleString()}
                </span>
              </div>
            )}
            {classification.aurora_prediction && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: C.textDim, minWidth: 140 }}>AURORA:</span>
                <span style={{ color: C.text }}>{classification.aurora_prediction}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 9 }}>
            Classification pending - awaiting arrival window
          </div>
        )}

        {/* CME Selector Buttons - Horizontal at bottom */}
        {cmes.length > 1 && (
          <div style={{ 
            display: 'flex', 
            gap: 4, 
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.border}`,
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {cmes.map((cme, idx) => (
              <button
                key={cme.id}
                onClick={() => setSelectedCMEIndex(idx)}
                style={{
                  background: idx === selectedCMEIndex 
                    ? `${CME_COLORS[idx % CME_COLORS.length]}22` 
                    : 'transparent',
                  border: `1px solid ${CME_COLORS[idx % CME_COLORS.length]}`,
                  color: CME_COLORS[idx % CME_COLORS.length],
                  minWidth: 28,
                  height: 28,
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  boxShadow: idx === selectedCMEIndex 
                    ? `0 0 12px ${CME_COLORS[idx % CME_COLORS.length]}88` 
                    : 'none'
                }}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
