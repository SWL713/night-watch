import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  plotBg: '#04060d',
  border: '#0d1525',
  grid: 'rgba(30,45,70,0.6)',
  zero: 'rgba(60,90,120,0.2)',
  text: '#e0e6ed',
  textDim: '#44ddaa',
  bz_neg: '#ee5577',
  bz_pos: '#44ddaa',
  by_neg: '#ff8800',
  by_pos: '#4488ff',
  phi: '#44aaff',
  crosshair: 'rgba(255,255,255,0.6)',
  annot_sb: 'rgba(200,200,200,0.6)',
  annot_shift: 'rgba(255,180,40,0.7)',
  phiAway: 'rgba(68,170,255,0.15)',
  phiToward: 'rgba(238,85,119,0.15)',
};

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
  
  const indices = {
    bx: cols.indexOf('bx'),
    by: cols.indexOf('by'),
    bz: cols.indexOf('bz'),
    phi: cols.indexOf('phi'),
  };
  
  return raw.data.map(row => {
    try {
      const t = new Date(row[ti]);
      if (isNaN(t.getTime())) return null;
      
      // DON'T normalize phi - let it be whatever it is (can go above 360° or below 0°)
      const phi = indices.phi >= 0 ? row[indices.phi] : null;
      
      return {
        time: t,
        bx: indices.bx >= 0 ? row[indices.bx] : null,
        by: indices.by >= 0 ? row[indices.by] : null,
        bz: indices.bz >= 0 ? row[indices.bz] : null,
        phi: phi,
      };
    } catch (_) { return null; }
  }).filter(Boolean);
}

function detectAnnotations(magData, timeRange) {
  const [tMin, tMax] = timeRange;
  const visData = magData.filter(d => d.time.getTime() >= tMin && d.time.getTime() <= tMax);
  const annotations = [];
  
  const SECTOR_STABILITY = 30 * 60000;
  let currentSector = null;
  let sectorStartTime = null;
  let lastSBAnnotation = 0;
  const MIN_SB_GAP = 2 * 3600000;
  
  for (const pt of visData) {
    if (pt.phi === null) continue;
    // Normalize ONLY for sector detection
    let normPhi = pt.phi % 360;
    if (normPhi < 0) normPhi += 360;
    const sector = (normPhi >= 180 && normPhi < 360) ? 'toward' : 'away';
    
    if (currentSector === null) {
      currentSector = sector;
      sectorStartTime = pt.time.getTime();
    } else if (sector !== currentSector) {
      currentSector = sector;
      sectorStartTime = pt.time.getTime();
    } else if (pt.time.getTime() - sectorStartTime >= SECTOR_STABILITY) {
      if (pt.time.getTime() - lastSBAnnotation >= MIN_SB_GAP) {
        annotations.push({ time: new Date(sectorStartTime), type: 'sb', label: 'SB' });
        lastSBAnnotation = pt.time.getTime();
        sectorStartTime = pt.time.getTime();
      }
    }
  }
  
  const PHI_SHIFT_THRESHOLD = 90;
  const SHIFT_WIN = 20 * 60000;
  const MIN_SHIFT_GAP = 3600000;
  let lastShiftAnnotation = 0;
  
  for (let i = 1; i < visData.length; i++) {
    const curr = visData[i];
    const prev = visData[i - 1];
    if (curr.phi === null || prev.phi === null) continue;
    
    const timeDiff = curr.time.getTime() - prev.time.getTime();
    if (timeDiff > SHIFT_WIN) continue;
    
    let phiChange = Math.abs(curr.phi - prev.phi);
    if (phiChange > 180) phiChange = 360 - phiChange;
    
    const phiChangeRate = (phiChange / timeDiff) * SHIFT_WIN;
    
    if (phiChangeRate >= PHI_SHIFT_THRESHOLD) {
      if (curr.time.getTime() - lastShiftAnnotation >= MIN_SHIFT_GAP) {
        annotations.push({ time: curr.time, type: 'shift', label: 'SHIFT' });
        lastShiftAnnotation = curr.time.getTime();
      }
      i += 10;
    }
  }
  
  return annotations.sort((a, b) => a.time - b.time);
}

function PlotCanvas({ data, series, yMin, yMax, timeRange, crosshairTime, onCrosshair, zoomMode, symmetric, showLabels, yLabel, phiMode, annotations, showAnnotations }) {
  const canvasRef = useRef(null);
  const dpr = window.devicePixelRatio || 1;

  const [resolvedYMin, resolvedYMax] = useMemo(() => {
    if (yMin != null && yMax != null) return [yMin, yMax];

    const [tMin, tMax] = timeRange;
    const visData = (data || []).filter(p => {
      const t = p.time.getTime();
      return t >= tMin && t <= tMax;
    });

    let allVals = [];
    for (const s of (series || [])) {
      if (!s || !s.key) continue;
      visData.forEach(p => {
        const v = p[s.key];
        if (v != null && !isNaN(v) && isFinite(v)) allVals.push(v);
      });
    }

    if (allVals.length < 2) {
      return [yMin ?? -10, yMax ?? 10];
    }

    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);

    if (symmetric) {
      const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax), 1) * 1.15;
      return [yMin ?? -absMax, yMax ?? absMax];
    } else {
      const span = Math.max(dataMax - dataMin, 0.1);
      const pad = span * 0.12;
      return [yMin ?? dataMin - pad, yMax ?? dataMax + pad];
    }
  }, [data, series, yMin, yMax, symmetric, timeRange]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W === 0 || H === 0) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const PAD_L = showLabels ? 36 : 8;
    const PAD_R = 6;
    const PAD_T = 12;
    const PAD_B = showLabels ? 14 : 4;
    const pW = W - PAD_L - PAD_R;
    const pH = H - PAD_T - PAD_B;

    const [tMin, tMax] = timeRange;
    const spanMs = tMax - tMin;

    function tx(t) { return PAD_L + ((t - tMin) / spanMs) * pW; }
    function vy(v) {
      if (v === null || v === undefined || isNaN(v)) return null;
      const y = PAD_T + pH - ((v - resolvedYMin) / (resolvedYMax - resolvedYMin)) * pH;
      return Math.max(PAD_T, Math.min(PAD_T + pH, y));
    }

    ctx.fillStyle = C.plotBg;
    ctx.fillRect(0, 0, W, H);

    // Phi sector backgrounds - repeating pattern every 360°
    if (phiMode) {
      // Draw sectors for the full range
      const yRangeMin = Math.floor(resolvedYMin / 360) * 360;
      const yRangeMax = Math.ceil(resolvedYMax / 360) * 360;
      
      for (let baseAngle = yRangeMin; baseAngle <= yRangeMax; baseAngle += 360) {
        const away0 = vy(baseAngle);
        const toward180 = vy(baseAngle + 180);
        const away360 = vy(baseAngle + 360);
        
        // Away sector (0-180°)
        if (away0 !== null && toward180 !== null) {
          ctx.fillStyle = C.phiAway;
          ctx.fillRect(PAD_L, toward180, pW, away0 - toward180);
        }
        
        // Toward sector (180-360°)
        if (toward180 !== null && away360 !== null) {
          ctx.fillStyle = C.phiToward;
          ctx.fillRect(PAD_L, away360, pW, toward180 - away360);
        }
      }
    }

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD_T + (i / 4) * pH;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(W - PAD_R, y);
      ctx.stroke();
    }

    if (resolvedYMin < 0 && resolvedYMax > 0 && !phiMode) {
      const y0 = vy(0);
      ctx.strokeStyle = C.zero;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y0);
      ctx.lineTo(W - PAD_R, y0);
      ctx.stroke();
    }

    if (showAnnotations && annotations && annotations.length > 0) {
      for (const ann of annotations) {
        const t = ann.time.getTime();
        if (t < tMin || t > tMax) continue;
        
        const x = tx(t);
        const color = ann.type === 'sb' ? C.annot_sb : C.annot_shift;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(ann.type === 'sb' ? [2, 3] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, PAD_T);
        ctx.lineTo(x, PAD_T + pH);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = color;
        ctx.font = `7px ${FONT}`;
        const labelWidth = ctx.measureText(ann.label).width;
        const labelX = (x + labelWidth + 4 > W - PAD_R) ? x - labelWidth - 2 : x + 2;
        ctx.fillText(ann.label, labelX, PAD_T + 8);
      }
    }

    const visData = data.filter(p => p.time.getTime() >= tMin && p.time.getTime() <= tMax);
    
    for (const s of series) {
      const pts = visData.filter(p => p[s.key] !== null);
      if (pts.length === 0) continue;

      if (s.scatter || phiMode) {
        for (const pt of pts) {
          const x = tx(pt.time.getTime());
          const y = vy(pt[s.key]);
          if (y === null) continue;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.lineWidth = s.width || 1.2;
        let drawing = false;
        let curColor = null;

        for (const pt of pts) {
          const x = tx(pt.time.getTime());
          const v = pt[s.key];
          const y = vy(v);
          if (y === null) {
            if (drawing) ctx.stroke();
            drawing = false;
            continue;
          }

          const color = s.colorFn ? s.colorFn(v) : s.color;

          if (!drawing) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, y);
            drawing = true;
            curColor = color;
          } else if (color !== curColor) {
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, y);
            curColor = color;
          } else {
            ctx.lineTo(x, y);
          }
        }
        if (drawing) ctx.stroke();
      }
    }

    if (crosshairTime && !zoomMode) {
      const closest = visData.reduce((prev, curr) =>
        Math.abs(curr.time.getTime() - crosshairTime) < Math.abs(prev.time.getTime() - crosshairTime) ? curr : prev
      , visData[0]);

      if (closest) {
        const x = tx(closest.time.getTime());
        ctx.strokeStyle = C.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(x, PAD_T);
        ctx.lineTo(x, PAD_T + pH);
        ctx.stroke();
        ctx.setLineDash([]);

        const dateLabel = closest.time.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        const timeLabel = closest.time.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit'
        });
        const fullLabel = `${dateLabel}, ${timeLabel}`;
        
        ctx.fillStyle = 'rgba(6,8,15,0.9)';
        ctx.font = `700 9px ${FONT}`;
        const labelWidth = ctx.measureText(fullLabel).width;
        const labelX = Math.min(x - labelWidth / 2, W - PAD_R - labelWidth - 2);
        const labelXClamped = Math.max(PAD_L + 2, labelX);
        ctx.fillRect(labelXClamped - 2, PAD_T - 12, labelWidth + 4, 11);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(fullLabel, labelXClamped, PAD_T - 4);

        for (const s of series) {
          const v = closest[s.key];
          if (v === null || v === undefined) continue;
          const y = vy(v);
          if (y === null) continue;
          const color = s.colorFn ? s.colorFn(v) : s.color;
          
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          
          const val = phiMode ? `${v.toFixed(0)}°` : v.toFixed(1);
          ctx.fillStyle = 'rgba(6,8,15,0.8)';
          const tw = ctx.measureText(val).width;
          const lx = Math.min(x + 3, W - PAD_R - tw - 2);
          ctx.fillRect(lx - 1, y - 8, tw + 4, 11);
          ctx.fillStyle = color;
          ctx.font = `8px ${FONT}`;
          ctx.fillText(val, lx + 1, y);
        }
      }
    }

    if (showLabels) {
      ctx.fillStyle = C.textDim;
      ctx.font = `9px ${FONT}`;
      ctx.textAlign = 'right';
      
      if (phiMode) {
        // Show major tick marks
        const step = 90;
        for (let angle = Math.ceil(resolvedYMin / step) * step; angle <= resolvedYMax; angle += step) {
          const y = vy(angle);
          if (y !== null) {
            ctx.fillText(`${angle}°`, PAD_L - 4, y + 3);
          }
        }
      } else {
        ctx.fillText(resolvedYMax.toFixed(0), PAD_L - 4, PAD_T + 10);
        if (!symmetric || resolvedYMin !== -resolvedYMax) {
          ctx.fillText('0', PAD_L - 4, vy(0) + 3);
        }
        ctx.fillText(resolvedYMin.toFixed(0), PAD_L - 4, PAD_T + pH);
      }

      if (yLabel) {
        ctx.save();
        ctx.translate(PAD_L - 28, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(yLabel, 0, 0);
        ctx.restore();
      }
    }

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T);
    ctx.lineTo(PAD_L, PAD_T + pH);
    ctx.lineTo(W - PAD_R, PAD_T + pH);
    ctx.stroke();
  }, [data, series, timeRange, resolvedYMin, resolvedYMax, crosshairTime, zoomMode, showLabels, yLabel, phiMode, annotations, showAnnotations, dpr]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [draw]);

  const handleInteraction = (e) => {
    if (!onCrosshair) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX || e.touches?.[0]?.clientX;
    if (!x) return;
    const clientX = x - rect.left;
    const PAD_L = showLabels ? 36 : 8;
    const PAD_R = 6;
    const pW = canvas.clientWidth - PAD_L - PAD_R;
    if (clientX < PAD_L || clientX > canvas.clientWidth - PAD_R) {
      onCrosshair(null);
      return;
    }
    const [tMin, tMax] = timeRange;
    const t = tMin + ((clientX - PAD_L) / pW) * (tMax - tMin);
    onCrosshair(t);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', cursor: zoomMode ? 'crosshair' : 'default' }}
      onMouseMove={(e) => !zoomMode && handleInteraction(e)}
      onTouchMove={(e) => !zoomMode && handleInteraction(e)}
      onMouseLeave={() => !zoomMode && onCrosshair?.(null)}
      onTouchEnd={() => !zoomMode && onCrosshair?.(null)}
      onClick={zoomMode ? handleInteraction : undefined}
    />
  );
}

export default function CMEClassificationTab({ cmes, classifications, registry }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [magData, setMagData] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedCMEId, setSelectedCMEId] = useState(null);
  
  const [presetMs, setPresetMs] = useState(24 * 3600000);
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);
  const [crosshairT, setCrosshairT] = useState(null);
  const zoomStartRef = useRef(null);

  const [bzByExpanded, setBzByExpanded] = useState(true);
  const [phiExpanded, setPhiExpanded] = useState(true);
  
  const [showAnnotations, setShowAnnotations] = useState(true);

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

  useEffect(() => {
    if (cmes && cmes.length > 0 && !selectedCMEId) {
      setSelectedCMEId(cmes[0].id);
    }
  }, [cmes, selectedCMEId]);

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

  const bzBySeries = [];
  if (showBz) bzBySeries.push({ key: 'bz', label: 'Bz', color: C.bz_pos, colorFn: (v) => v >= 0 ? C.bz_pos : C.bz_neg, width: 1.5 });
  if (showBy) bzBySeries.push({ key: 'by', label: 'By', color: C.by_pos, colorFn: (v) => v >= 0 ? C.by_pos : C.by_neg, width: 1.5 });

  const phiSeries = [{ key: 'phi', label: 'Phi', color: C.phi, scatter: true }];

  const annotations = useMemo(() => detectAnnotations(magData, timeRange), [magData, timeRange]);

  if (cmes.length === 0) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11 }}>No active CMEs to classify</div>;
  }

  const selectedCME = cmes.find(c => c.id === selectedCMEId) || cmes[0];
  const assignment = registry[selectedCME.id] || { number: 0, color: '#888' };
  const selectedColor = assignment.color;
  const selectedNumber = assignment.number;
  const classification = classifications[selectedCME.id];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 3, padding: '3px 8px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1, marginRight: 4 }}>RANGE</span>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setPresetMs(p.ms); setZoomRange(null); }} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT,
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
        }}>🔍</button>
        {zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT,
            background: '#1a0a00', border: '1px solid #ff8800', color: '#ff8800',
            cursor: 'pointer', borderRadius: 2,
          }}>RESET</button>
        )}
        <button onClick={() => setShowAnnotations(v => !v)} style={{
          padding: '1px 7px', fontSize: 8, fontFamily: FONT,
          background: showAnnotations ? '#0d1a2a' : 'transparent',
          border: `1px solid ${showAnnotations ? '#44aaff' : '#1a2a3a'}`,
          color: showAnnotations ? '#44aaff' : '#2a4a5a',
          cursor: 'pointer', borderRadius: 2, marginLeft: 4,
        }}>ANNOT</button>
      </div>

      {zoomMode && (
        <div style={{ padding: '3px 10px', background: '#1a0d00', borderBottom: `1px solid #ff8800`,
          color: '#ff8800', fontSize: 8, flexShrink: 0, textAlign: 'center' }}>
          {zoomStep === 0 ? 'TAP FIRST POINT' : 'TAP SECOND POINT'}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px', gap: 6, overflow: 'hidden' }}>
        <div style={{ 
          background: C.bg, 
          border: `1px solid ${C.border}`, 
          borderRadius: 4, 
          display: 'flex', 
          flexDirection: 'column',
          flex: bzByExpanded ? 1 : 0,
          minHeight: bzByExpanded ? 100 : 'auto'
        }}>
          <div onClick={() => setBzByExpanded(!bzByExpanded)} style={{ 
            padding: '4px 8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: bzByExpanded ? `1px solid ${C.border}` : 'none', flexShrink: 0
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
          {bzByExpanded && magData.length > 0 && (
            <div style={{ flex: 1, padding: '4px', minHeight: 0 }}>
              <PlotCanvas data={magData} series={bzBySeries} timeRange={timeRange} crosshairTime={crosshairT} onCrosshair={setCrosshairT} zoomMode={false} symmetric={true} showLabels={true} yLabel="nT" annotations={annotations} showAnnotations={showAnnotations} />
            </div>
          )}
        </div>

        {magData.length > 0 && (
          <div style={{ 
            background: C.bg, 
            border: `1px solid ${C.border}`, 
            borderRadius: 4, 
            display: 'flex', 
            flexDirection: 'column',
            flex: phiExpanded ? 1 : 0,
            minHeight: phiExpanded ? 100 : 'auto'
          }}>
            <div onClick={() => setPhiExpanded(!phiExpanded)} style={{ 
              padding: '4px 8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: phiExpanded ? `1px solid ${C.border}` : 'none', flexShrink: 0
            }}>
              <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1 }}>IMF PHI GSM (°)</span>
              <span style={{ color: C.textDim, fontSize: 12 }}>{phiExpanded ? '▼' : '▶'}</span>
            </div>
            {phiExpanded && (
              <div style={{ flex: 1, padding: '4px', minHeight: 0 }}>
                <PlotCanvas data={magData} series={phiSeries} timeRange={timeRange} crosshairTime={crosshairT} onCrosshair={setCrosshairT} zoomMode={false} showLabels={true} yLabel="deg" phiMode={true} annotations={annotations} showAnnotations={showAnnotations} />
              </div>
            )}
          </div>
        )}

        <div style={{ 
          flex: 1,
          background: C.bg, 
          border: `2px solid ${selectedColor}`, 
          borderRadius: 4, 
          padding: '6px', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 100,
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ color: selectedColor, fontSize: 18, fontWeight: 'bold' }}>{selectedNumber}</span>
            <span style={{ color: C.textDim, fontSize: 9, fontFamily: FONT, flex: 1 }}>{selectedCME.id}</span>
            <span style={{
              background: selectedCME.state?.current === 'WATCH' ? '#FFA500' : '#4a6a70',
              color: selectedCME.state?.current === 'WATCH' ? '#000' : '#fff',
              padding: '3px 10px', borderRadius: 3, fontSize: 8, fontWeight: 700
            }}>{selectedCME.state?.current || 'UNKNOWN'}</span>
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
              <div style={{ textAlign: 'center', padding: '12px 0', color: C.textDim, fontSize: 9 }}>Classification pending</div>
            )}
          </div>

          {cmes.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}`, justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
              {cmes.map((cme) => {
                const cmeAssignment = registry[cme.id] || { number: 0, color: '#888' };
                return (
                  <button key={cme.id} onClick={() => setSelectedCMEId(cme.id)} style={{
                    background: cme.id === selectedCMEId ? `${cmeAssignment.color}22` : 'transparent',
                    border: `1px solid ${cmeAssignment.color}`,
                    color: cmeAssignment.color,
                    minWidth: 28, height: 28, borderRadius: 4, cursor: 'pointer',
                    fontSize: 10, fontWeight: 'bold', transition: 'all 0.2s ease',
                    boxShadow: cme.id === selectedCMEId ? `0 0 12px ${cmeAssignment.color}88` : 'none'
                  }}>{cmeAssignment.number}</button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
