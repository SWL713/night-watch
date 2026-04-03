import { useState, useEffect, useRef } from 'react';

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
  crosshair: 'rgba(255,255,255,0.35)',
};

const CME_COLORS = [
  '#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', 
  '#FF0080', '#0080FF', '#FF8000', '#80FF00',
];

const PRESETS = [
  { label: '1H',  ms: 1  * 3600000 },
  { label: '6H',  ms: 6  * 3600000 },
  { label: '24H', ms: 24 * 3600000 },
  { label: '3D',  ms: 3  * 86400000 },
  { label: '7D',  ms: 7  * 86400000 },
];

// Use SAME data source as Space Weather panel
const BASE = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data';
const MAG_URL = `${BASE}/sw_mag_7day.json`;

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

function parseColumnFile(raw) {
  if (!raw || !raw.columns || !raw.data) return [];
  const cols = raw.columns;
  const ti = cols.indexOf('time');
  if (ti === -1) return [];
  
  const bxIdx = cols.indexOf('bx');
  const byIdx = cols.indexOf('by');
  const bzIdx = cols.indexOf('bz');
  const phiIdx = cols.indexOf('phi');
  
  return raw.data.map(row => {
    try {
      const t = new Date(row[ti]);
      if (isNaN(t.getTime())) return null;
      return {
        time: t,
        bx: bxIdx >= 0 ? row[bxIdx] : null,
        by: byIdx >= 0 ? row[byIdx] : null,
        bz: bzIdx >= 0 ? row[bzIdx] : null,
        phi: phiIdx >= 0 ? row[phiIdx] : null,
      };
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [magData, setMagData] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedCMEIndex, setSelectedCMEIndex] = useState(0);
  
  const [presetMs, setPresetMs] = useState(24 * 3600000);
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);
  const [crosshairT, setCrosshairT] = useState(null);
  const zoomStartRef = useRef(null);

  useEffect(() => {
    const fetchMagData = async () => {
      try {
        console.log('Fetching from:', MAG_URL);
        const response = await fetch(MAG_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const raw = await response.json();
        console.log('Raw mag data:', raw);
        
        const parsed = parseColumnFile(raw);
        console.log(`Parsed ${parsed.length} mag data points`);
        
        setMagData(parsed);
        setLoadError(null);
      } catch (err) {
        console.error('Error loading mag data:', err);
        setLoadError(err.message);
      }
    };

    fetchMagData();
    const interval = setInterval(fetchMagData, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const timeRange = zoomRange || [now - presetMs, now];

  const handleZoomTap = (time) => {
    if (zoomStep === 0) {
      zoomStartRef.current = time;
      setZoomStep(1);
    } else {
      const a = zoomStartRef.current;
      const b = time;
      setZoomRange([Math.min(a, b), Math.max(a, b)]);
      zoomStartRef.current = null;
      setZoomStep(0);
      setZoomMode(false);
    }
  };

  const renderBzByPlot = () => {
    if (loadError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#ff4444', fontSize: 10 }}>
          Error: {loadError}
        </div>
      );
    }

    if (magData.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.textDim, fontSize: 10 }}>
          Loading magnetic field data...
        </div>
      );
    }

    const width = 900;
    const height = 200;
    const padL = 45, padR = 10, padT = 15, padB = 25;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const [tMin, tMax] = timeRange;
    const visibleData = magData.filter(d => d.time.getTime() >= tMin && d.time.getTime() <= tMax);
    
    if (visibleData.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.textDim, fontSize: 10 }}>
          No data in selected range
        </div>
      );
    }

    const allVals = visibleData.flatMap(d => [d.bz, d.by]).filter(v => v != null);
    const minVal = Math.min(...allVals, -10);
    const maxVal = Math.max(...allVals, 10);

    const scaleY = (v) => {
      const norm = (v - minVal) / (maxVal - minVal);
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (t) => {
      return padL + ((t - tMin) / (tMax - tMin)) * plotWidth;
    };

    const bzPoints = [];
    const byPoints = [];
    
    visibleData.forEach((d, i) => {
      const x = scaleX(d.time.getTime());
      if (d.bz != null) bzPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${scaleY(d.bz)}`);
      if (d.by != null) byPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${scaleY(d.by)}`);
    });

    const bzPath = bzPoints.join(' ');
    const byPath = byPoints.join(' ');

    let crosshairData = null;
    if (crosshairT && !zoomMode) {
      const closest = visibleData.reduce((prev, curr) => {
        return Math.abs(curr.time.getTime() - crosshairT) < Math.abs(prev.time.getTime() - crosshairT) ? curr : prev;
      });
      crosshairData = closest;
    }

    return (
      <svg 
        width={width} 
        height={height} 
        style={{ background: C.plotBg, borderRadius: 4, cursor: zoomMode ? 'crosshair' : 'default' }}
        onMouseMove={(e) => {
          if (zoomMode) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < padL || x > width - padR) return;
          const t = tMin + ((x - padL) / plotWidth) * (tMax - tMin);
          setCrosshairT(t);
        }}
        onMouseLeave={() => !zoomMode && setCrosshairT(null)}
        onClick={(e) => {
          if (!zoomMode) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < padL || x > width - padR) return;
          const t = tMin + ((x - padL) / plotWidth) * (tMax - tMin);
          handleZoomTap(t);
        }}
      >
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        {showBz && bzPath && <path d={bzPath} fill="none" stroke={C.bz} strokeWidth="2.5" />}
        {showBy && byPath && <path d={byPath} fill="none" stroke={C.by} strokeWidth="2.5" />}
        
        {crosshairData && (
          <>
            <line 
              x1={scaleX(crosshairData.time.getTime())} 
              y1={padT} 
              x2={scaleX(crosshairData.time.getTime())} 
              y2={height - padB} 
              stroke={C.crosshair} 
              strokeWidth="1.5" 
              strokeDasharray="4,2"
            />
            {showBz && crosshairData.bz != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.bz)} r="4" fill={C.bz} />
                <text 
                  x={scaleX(crosshairData.time.getTime()) + 8} 
                  y={scaleY(crosshairData.bz) + 4} 
                  fill={C.bz} 
                  fontSize="11" 
                  fontFamily={FONT}
                  fontWeight="700"
                >
                  Bz: {crosshairData.bz.toFixed(1)}
                </text>
              </g>
            )}
            {showBy && crosshairData.by != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.by)} r="4" fill={C.by} />
                <text 
                  x={scaleX(crosshairData.time.getTime()) + 8} 
                  y={scaleY(crosshairData.by) + 16} 
                  fill={C.by} 
                  fontSize="11" 
                  fontFamily={FONT}
                  fontWeight="700"
                >
                  By: {crosshairData.by.toFixed(1)}
                </text>
              </g>
            )}
          </>
        )}
        
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <text x={padL - 32} y={scaleY(maxVal) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>{maxVal.toFixed(0)}</text>
        <text x={padL - 32} y={scaleY(0) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>0</text>
        <text x={padL - 32} y={scaleY(minVal) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>{minVal.toFixed(0)}</text>
        <text x={padL - 38} y={height / 2} fill={C.textDim} fontSize="11" fontFamily={FONT} transform={`rotate(-90 ${padL - 38} ${height / 2})`}>nT</text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (loadError || magData.length === 0) return null;

    const width = 900;
    const height = 150;
    const padL = 45, padR = 10, padT = 15, padB = 25;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const [tMin, tMax] = timeRange;
    const visibleData = magData.filter(d => d.time.getTime() >= tMin && d.time.getTime() <= tMax);
    
    if (visibleData.length === 0) return null;

    const scaleY = (angle) => {
      const norm = (angle + 180) / 360;
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (t) => {
      return padL + ((t - tMin) / (tMax - tMin)) * plotWidth;
    };

    const phiPoints = [];
    visibleData.forEach((d, i) => {
      const x = scaleX(d.time.getTime());
      if (d.phi != null) phiPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${scaleY(d.phi)}`);
    });

    const phiPath = phiPoints.join(' ');

    let crosshairData = null;
    if (crosshairT && !zoomMode) {
      const closest = visibleData.reduce((prev, curr) => {
        return Math.abs(curr.time.getTime() - crosshairT) < Math.abs(prev.time.getTime() - crosshairT) ? curr : prev;
      });
      crosshairData = closest;
    }

    return (
      <svg 
        width={width} 
        height={height} 
        style={{ background: C.plotBg, borderRadius: 4, cursor: zoomMode ? 'crosshair' : 'default' }}
        onMouseMove={(e) => {
          if (zoomMode) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < padL || x > width - padR) return;
          const t = tMin + ((x - padL) / plotWidth) * (tMax - tMin);
          setCrosshairT(t);
        }}
        onMouseLeave={() => !zoomMode && setCrosshairT(null)}
        onClick={(e) => {
          if (!zoomMode) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < padL || x > width - padR) return;
          const t = tMin + ((x - padL) / plotWidth) * (tMax - tMin);
          handleZoomTap(t);
        }}
      >
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        <line x1={padL} y1={scaleY(90)} x2={width - padR} y2={scaleY(90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padL} y1={scaleY(-90)} x2={width - padR} y2={scaleY(-90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        {phiPath && <path d={phiPath} fill="none" stroke={C.phi} strokeWidth="2.5" />}
        
        {crosshairData && (
          <>
            <line 
              x1={scaleX(crosshairData.time.getTime())} 
              y1={padT} 
              x2={scaleX(crosshairData.time.getTime())} 
              y2={height - padB} 
              stroke={C.crosshair} 
              strokeWidth="1.5" 
              strokeDasharray="4,2"
            />
            {crosshairData.phi != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.phi)} r="4" fill={C.phi} />
                <text 
                  x={scaleX(crosshairData.time.getTime()) + 8} 
                  y={scaleY(crosshairData.phi) + 4} 
                  fill={C.phi} 
                  fontSize="11" 
                  fontFamily={FONT}
                  fontWeight="700"
                >
                  {crosshairData.phi.toFixed(0)}°
                </text>
              </g>
            )}
          </>
        )}
        
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} />
        <text x={padL - 32} y={scaleY(180) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>180°</text>
        <text x={padL - 32} y={scaleY(0) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>0°</text>
        <text x={padL - 32} y={scaleY(-180) + 4} fill={C.textDim} fontSize="10" fontFamily={FONT}>-180°</text>
        <text x={padL - 38} y={height / 2} fill={C.textDim} fontSize="11" fontFamily={FONT} transform={`rotate(-90 ${padL - 38} ${height / 2})`}>Phi (deg)</text>
      </svg>
    );
  };

  if (cmes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11 }}>
        No active CMEs to classify
      </div>
    );
  }

  const selectedCME = cmes[selectedCMEIndex];
  const selectedColor = CME_COLORS[selectedCMEIndex % CME_COLORS.length];
  const classification = classifications[selectedCME.id];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Time range controls */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 8px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1, marginRight: 4 }}>RANGE</span>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setPresetMs(p.ms); setZoomRange(null); }} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT, letterSpacing: 0.5,
            background: !zoomRange && presetMs === p.ms ? '#0d1a2a' : 'transparent',
            border: `1px solid ${!zoomRange && presetMs === p.ms ? '#44ddaa' : '#1a2a3a'}`,
            color: !zoomRange && presetMs === p.ms ? '#44ddaa' : '#2a4a5a',
            cursor: 'pointer', borderRadius: 2,
          }}>{p.label}</button>
        ))}
        <button onClick={() => setZoomMode(m => !m)} style={{
          padding: '1px 7px', fontSize: 8, fontFamily: FONT,
          background: zoomMode ? '#1a0a00' : 'transparent',
          border: `1px solid ${zoomMode ? '#ff8800' : '#1a2a3a'}`,
          color: zoomMode ? '#ff8800' : '#2a4a5a',
          cursor: 'pointer', borderRadius: 2, marginLeft: 4,
        }}>🔍 ZOOM</button>
        {zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT,
            background: '#1a0a00', border: '1px solid #ff8800', color: '#ff8800',
            cursor: 'pointer', borderRadius: 2,
          }}>RESET ZOOM</button>
        )}
      </div>

      {zoomMode && (
        <div style={{ padding: '3px 10px', background: '#1a0d00', borderBottom: `1px solid #ff8800`,
          color: '#ff8800', fontSize: 8, letterSpacing: 0.5, flexShrink: 0, textAlign: 'center' }}>
          {zoomStep === 0 ? 'TAP FIRST POINT ON ANY PLOT' : 'TAP SECOND POINT TO SET ZOOM RANGE'}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {/* Bz/By Plot */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px', marginBottom: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1 }}>MAGNETIC FIELD (nT)</span>
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
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px', marginBottom: 10, flexShrink: 0 }}>
            <div style={{ marginBottom: 10 }}>
              <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1 }}>IMF PHI GSM (°)</span>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              {renderPhiPlot()}
            </div>
          </div>
        )}

        {/* Classification Details */}
        <div style={{ background: C.bg, border: `2px solid ${selectedColor}`, borderRadius: 4, padding: '12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: selectedColor, fontSize: 20, fontWeight: 'bold' }}>{selectedCMEIndex + 1}</span>
            <span style={{ color: C.textDim, fontSize: 10, fontFamily: FONT, flex: 1 }}>{selectedCME.id}</span>
            <span style={{
              background: selectedCME.state.current === 'WATCH' ? '#FFA500' : '#4a6a70',
              color: selectedCME.state.current === 'WATCH' ? '#000' : '#fff',
              padding: '4px 12px', borderRadius: 3, fontSize: 9, fontWeight: 700
            }}>{selectedCME.state.current}</span>
          </div>

          {classification ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: C.textDim, minWidth: 160 }}>BOTHMER-SCHWENN:</span>
                <span style={{ color: C.text }}>{classification.bs_type || 'Pending'}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: C.textDim, minWidth: 160 }}>CONFIDENCE:</span>
                <span style={{ color: C.text }}>{classification.confidence ? `${classification.confidence}%` : 'Pending'}</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: C.textDim, fontSize: 10 }}>
              Classification pending - awaiting arrival window
            </div>
          )}

          {cmes.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, justifyContent: 'center', flexWrap: 'wrap' }}>
              {cmes.map((cme, idx) => (
                <button
                  key={cme.id}
                  onClick={() => setSelectedCMEIndex(idx)}
                  style={{
                    background: idx === selectedCMEIndex ? `${CME_COLORS[idx % CME_COLORS.length]}22` : 'transparent',
                    border: `1px solid ${CME_COLORS[idx % CME_COLORS.length]}`,
                    color: CME_COLORS[idx % CME_COLORS.length],
                    minWidth: 32, height: 32, borderRadius: 4, cursor: 'pointer',
                    fontSize: 11, fontWeight: 'bold', transition: 'all 0.2s ease',
                    boxShadow: idx === selectedCMEIndex ? `0 0 12px ${CME_COLORS[idx % CME_COLORS.length]}88` : 'none'
                  }}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
