import { useState, useEffect, useRef } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  plotBg: '#04060d',
  border: '#0d1525',
  grid: 'rgba(30,45,70,0.6)',
  zero: 'rgba(60,90,120,0.2)',  // MUCH MORE SUBTLE
  text: '#e0e6ed',
  textDim: '#44ddaa',
  bz_pos: '#44ddaa',
  bz_neg: '#ee5577',
  by_pos: '#4488ff',
  by_neg: '#ff8800',
  phi: '#44aaff',
  crosshair: 'rgba(255,255,255,0.35)',
};

const CME_COLORS = [
  '#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', 
  '#FF0080', '#0080FF', '#FF8000', '#80FF00',
];

// TIME RANGE PRESETS - 24H default, add 12H and 48H
const PRESETS = [
  { label: '12H', ms: 12 * 3600000 },
  { label: '24H', ms: 24 * 3600000 },
  { label: '48H', ms: 48 * 3600000 },
];

const BASE = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data';
const MAG_URL = `${BASE}/sw_mag_7day.json`;

function Toggle({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
      border: `1px solid ${active ? color : '#1a2a3a'}`,
      color: active ? color : '#2a4a5a',
      padding: '2px 8px', fontSize: 8, fontFamily: FONT,
      cursor: 'pointer', borderRadius: 2, letterSpacing: 0.5,
      fontWeight: active ? 700 : 400, transition: 'all 0.15s',
    }}>{label}</button>
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
    } catch (_) { return null; }
  }).filter(Boolean);
}

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [magData, setMagData] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedCMEIndex, setSelectedCMEIndex] = useState(0);
  
  const [presetMs, setPresetMs] = useState(24 * 3600000); // 24H DEFAULT
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);
  const [crosshairT, setCrosshairT] = useState(null);
  const zoomStartRef = useRef(null);

  const [bzByExpanded, setBzByExpanded] = useState(true);
  const [phiExpanded, setPhiExpanded] = useState(true);

  useEffect(() => {
    const fetchMagData = async () => {
      try {
        const response = await fetch(MAG_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        const parsed = parseColumnFile(raw);
        setMagData(parsed);
        setLoadError(null);
      } catch (err) {
        console.error('Error loading mag data:', err);
        setLoadError(err.message);
      }
    };
    fetchMagData();
    const interval = setInterval(fetchMagData, 5 * 60 * 1000);
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
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: '#ff4444', fontSize: 10 }}>Error: {loadError}</div>;
    }
    if (magData.length === 0) {
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: C.textDim, fontSize: 10 }}>Loading...</div>;
    }

    const width = 850, height = 140;
    const padL = 42, padR = 8, padT = 12, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const [tMin, tMax] = timeRange;
    const visibleData = magData.filter(d => d.time.getTime() >= tMin && d.time.getTime() <= tMax);
    
    if (visibleData.length === 0) {
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: C.textDim, fontSize: 10 }}>No data</div>;
    }

    // AUTO-SCALE Y-axis
    const allVals = visibleData.flatMap(d => [d.bz, d.by]).filter(v => v != null);
    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);
    const minVal = Math.min(dataMin, -5);  // Include 0 with some padding
    const maxVal = Math.max(dataMax, 5);

    const scaleY = (v) => {
      const norm = (v - minVal) / (maxVal - minVal);
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotWidth;

    const bzSegments = [];
    const bySegments = [];
    let currentBzColor = null;
    let currentByColor = null;
    let bzPath = [];
    let byPath = [];

    visibleData.forEach((d, i) => {
      const x = scaleX(d.time.getTime());
      
      if (d.bz != null) {
        const bzColor = d.bz >= 0 ? C.bz_pos : C.bz_neg;
        if (bzColor !== currentBzColor && bzPath.length > 0) {
          bzSegments.push({ color: currentBzColor, path: bzPath.join(' ') });
          bzPath = [];
        }
        bzPath.push(`${bzPath.length === 0 ? 'M' : 'L'} ${x} ${scaleY(d.bz)}`);
        currentBzColor = bzColor;
      }
      
      if (d.by != null) {
        const byColor = d.by >= 0 ? C.by_pos : C.by_neg;
        if (byColor !== currentByColor && byPath.length > 0) {
          bySegments.push({ color: currentByColor, path: byPath.join(' ') });
          byPath = [];
        }
        byPath.push(`${byPath.length === 0 ? 'M' : 'L'} ${x} ${scaleY(d.by)}`);
        currentByColor = byColor;
      }
    });

    if (bzPath.length > 0) bzSegments.push({ color: currentBzColor, path: bzPath.join(' ') });
    if (byPath.length > 0) bySegments.push({ color: currentByColor, path: byPath.join(' ') });

    let crosshairData = null;
    if (crosshairT && !zoomMode) {
      crosshairData = visibleData.reduce((prev, curr) => 
        Math.abs(curr.time.getTime() - crosshairT) < Math.abs(prev.time.getTime() - crosshairT) ? curr : prev
      );
    }

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4, cursor: zoomMode ? 'crosshair' : 'default' }}
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
        {/* SUBTLE zero line */}
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="1" />
        {showBz && bzSegments.map((seg, i) => (
          <path key={`bz${i}`} d={seg.path} fill="none" stroke={seg.color} strokeWidth="2" />
        ))}
        {showBy && bySegments.map((seg, i) => (
          <path key={`by${i}`} d={seg.path} fill="none" stroke={seg.color} strokeWidth="2" />
        ))}
        
        {crosshairData && (
          <>
            <line x1={scaleX(crosshairData.time.getTime())} y1={padT} x2={scaleX(crosshairData.time.getTime())} y2={height - padB} stroke={C.crosshair} strokeWidth="1" strokeDasharray="3,2" />
            {showBz && crosshairData.bz != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.bz)} r="3" fill={crosshairData.bz >= 0 ? C.bz_pos : C.bz_neg} />
                <text x={scaleX(crosshairData.time.getTime()) + 6} y={scaleY(crosshairData.bz) + 3} fill={crosshairData.bz >= 0 ? C.bz_pos : C.bz_neg} fontSize="9" fontFamily={FONT} fontWeight="700">
                  Bz: {crosshairData.bz.toFixed(1)}
                </text>
              </g>
            )}
            {showBy && crosshairData.by != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.by)} r="3" fill={crosshairData.by >= 0 ? C.by_pos : C.by_neg} />
                <text x={scaleX(crosshairData.time.getTime()) + 6} y={scaleY(crosshairData.by) + 12} fill={crosshairData.by >= 0 ? C.by_pos : C.by_neg} fontSize="9" fontFamily={FONT} fontWeight="700">
                  By: {crosshairData.by.toFixed(1)}
                </text>
              </g>
            )}
          </>
        )}
        
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} />
        <text x={padL - 28} y={scaleY(maxVal) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>{maxVal.toFixed(0)}</text>
        <text x={padL - 28} y={scaleY(0) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>0</text>
        <text x={padL - 28} y={scaleY(minVal) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>{minVal.toFixed(0)}</text>
        <text x={padL - 35} y={height / 2} fill={C.textDim} fontSize="10" fontFamily={FONT} transform={`rotate(-90 ${padL - 35} ${height / 2})`}>nT</text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (loadError || magData.length === 0) return null;

    const width = 850, height = 120;
    const padL = 42, padR = 8, padT = 12, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const [tMin, tMax] = timeRange;
    const visibleData = magData.filter(d => d.time.getTime() >= tMin && d.time.getTime() <= tMax);
    if (visibleData.length === 0) return null;

    const scaleY = (angle) => {
      const norm = (angle + 180) / 360;
      return padT + plotHeight - (norm * plotHeight);
    };
    const scaleX = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotWidth;

    const phiPoints = [];
    visibleData.forEach((d, i) => {
      const x = scaleX(d.time.getTime());
      if (d.phi != null) phiPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${scaleY(d.phi)}`);
    });
    const phiPath = phiPoints.join(' ');

    let crosshairData = null;
    if (crosshairT && !zoomMode) {
      crosshairData = visibleData.reduce((prev, curr) => 
        Math.abs(curr.time.getTime() - crosshairT) < Math.abs(prev.time.getTime() - crosshairT) ? curr : prev
      );
    }

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4, cursor: zoomMode ? 'crosshair' : 'default' }}
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
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="1" />
        <line x1={padL} y1={scaleY(90)} x2={width - padR} y2={scaleY(90)} stroke={C.grid} strokeDasharray="2,2" />
        <line x1={padL} y1={scaleY(-90)} x2={width - padR} y2={scaleY(-90)} stroke={C.grid} strokeDasharray="2,2" />
        {phiPath && <path d={phiPath} fill="none" stroke={C.phi} strokeWidth="2" />}
        
        {crosshairData && (
          <>
            <line x1={scaleX(crosshairData.time.getTime())} y1={padT} x2={scaleX(crosshairData.time.getTime())} y2={height - padB} stroke={C.crosshair} strokeWidth="1" strokeDasharray="3,2" />
            {crosshairData.phi != null && (
              <g>
                <circle cx={scaleX(crosshairData.time.getTime())} cy={scaleY(crosshairData.phi)} r="3" fill={C.phi} />
                <text x={scaleX(crosshairData.time.getTime()) + 6} y={scaleY(crosshairData.phi) + 3} fill={C.phi} fontSize="9" fontFamily={FONT} fontWeight="700">{crosshairData.phi.toFixed(0)}°</text>
              </g>
            )}
          </>
        )}
        
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} />
        <text x={padL - 28} y={scaleY(180) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>180°</text>
        <text x={padL - 28} y={scaleY(0) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>0°</text>
        <text x={padL - 28} y={scaleY(-180) + 3} fill={C.textDim} fontSize="9" fontFamily={FONT}>-180°</text>
        <text x={padL - 35} y={height / 2} fill={C.textDim} fontSize="10" fontFamily={FONT} transform={`rotate(-90 ${padL - 35} ${height / 2})`}>Phi (deg)</text>
      </svg>
    );
  };

  if (cmes.length === 0) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11 }}>No active CMEs to classify</div>;
  }

  const selectedCME = cmes[selectedCMEIndex];
  const selectedColor = CME_COLORS[selectedCMEIndex % CME_COLORS.length];
  const classification = classifications[selectedCME.id];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Time range controls - 12H, 24H, 48H */}
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
          }}>RESET</button>
        )}
      </div>

      {zoomMode && (
        <div style={{ padding: '3px 10px', background: '#1a0d00', borderBottom: `1px solid #ff8800`,
          color: '#ff8800', fontSize: 8, letterSpacing: 0.5, flexShrink: 0, textAlign: 'center' }}>
          {zoomStep === 0 ? 'TAP FIRST POINT' : 'TAP SECOND POINT'}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px', gap: 8, overflow: 'hidden' }}>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, flexShrink: 0 }}>
          <div onClick={() => setBzByExpanded(!bzByExpanded)} style={{ 
            padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: bzByExpanded ? `1px solid ${C.border}` : 'none'
          }}>
            <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1 }}>MAGNETIC FIELD (nT)</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {bzByExpanded && (
                <>
                  <Toggle label="Bz" active={showBz} color={C.bz_pos} onClick={(e) => { e.stopPropagation(); setShowBz(v => !v); }} />
                  <Toggle label="By" active={showBy} color={C.by_pos} onClick={(e) => { e.stopPropagation(); setShowBy(v => !v); }} />
                </>
              )}
              <span style={{ color: C.textDim, fontSize: 12 }}>{bzByExpanded ? '▼' : '▶'}</span>
            </div>
          </div>
          {bzByExpanded && (
            <div style={{ padding: '8px', overflowX: 'auto' }}>
              {renderBzByPlot()}
            </div>
          )}
        </div>

        {magData.length > 0 && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, flexShrink: 0 }}>
            <div onClick={() => setPhiExpanded(!phiExpanded)} style={{ 
              padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: phiExpanded ? `1px solid ${C.border}` : 'none'
            }}>
              <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1 }}>IMF PHI GSM (°)</span>
              <span style={{ color: C.textDim, fontSize: 12 }}>{phiExpanded ? '▼' : '▶'}</span>
            </div>
            {phiExpanded && (
              <div style={{ padding: '8px', overflowX: 'auto' }}>
                {renderPhiPlot()}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, background: C.bg, border: `2px solid ${selectedColor}`, borderRadius: 4, padding: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: selectedColor, fontSize: 18, fontWeight: 'bold' }}>{selectedCMEIndex + 1}</span>
            <span style={{ color: C.textDim, fontSize: 9, fontFamily: FONT, flex: 1 }}>{selectedCME.id}</span>
            <span style={{
              background: selectedCME.state.current === 'WATCH' ? '#FFA500' : '#4a6a70',
              color: selectedCME.state.current === 'WATCH' ? '#000' : '#fff',
              padding: '3px 10px', borderRadius: 3, fontSize: 8, fontWeight: 700
            }}>{selectedCME.state.current}</span>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {classification ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: C.textDim, minWidth: 140 }}>BOTHMER-SCHWENN:</span>
                  <span style={{ color: C.text }}>{classification.bs_type || 'Pending'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: C.textDim, minWidth: 140 }}>CONFIDENCE:</span>
                  <span style={{ color: C.text }}>{classification.confidence ? `${classification.confidence}%` : 'Pending'}</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 0', color: C.textDim, fontSize: 9 }}>
                Classification pending
              </div>
            )}
          </div>

          {cmes.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, justifyContent: 'center', flexWrap: 'wrap' }}>
              {cmes.map((cme, idx) => (
                <button key={cme.id} onClick={() => setSelectedCMEIndex(idx)} style={{
                  background: idx === selectedCMEIndex ? `${CME_COLORS[idx % CME_COLORS.length]}22` : 'transparent',
                  border: `1px solid ${CME_COLORS[idx % CME_COLORS.length]}`,
                  color: CME_COLORS[idx % CME_COLORS.length],
                  minWidth: 28, height: 28, borderRadius: 4, cursor: 'pointer',
                  fontSize: 10, fontWeight: 'bold', transition: 'all 0.2s ease',
                  boxShadow: idx === selectedCMEIndex ? `0 0 12px ${CME_COLORS[idx % CME_COLORS.length]}88` : 'none'
                }}>{idx + 1}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
