import { useState, useEffect, useRef, useCallback, Component } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';

// CME_Watch exact colors from render_aurora_card.py
const C = {
  bg: '#06080f',
  panelBg: '#070b16',
  grid: '#0d1225',
  text: '#e0e6ed',
  textDim: '#445566',
  textFaint: '#334455',
  
  // Bz colors
  bz_north: '#33ddaa',
  bz_south: '#ee5577',
  bt: '#6655aa',
  
  // By colors  
  by_dusk: '#ffaa33',
  by_dawn: '#6699ff',
  
  // Phi colors
  phi: '#aa88ff',
  phi_label: '#bb88ff',
  
  // Reference lines
  zero: '#2a3a4a',
  storm_line: '#cc2233',
  
  // Shock marker
  shock: '#ffcc44',
  
  // Annotations
  hcs: '#778899',
  boundary: '#ff6600',
  
  // UI
  crosshair: 'rgba(255,255,255,0.6)',
  classBox: '#0a0e18',
  progressBar: '#1a2a3a',
  progressFill: '#44aaff',
};

const TIME_RANGES = [
  { label: '6H', hours: 6 },
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '48H', hours: 48 },
];

function CMEClassificationTab({ cmes, classifications, classificationMetadata, magData: magDataProp, stereoData: stereoDataProp }) {
  const [timeRange, setTimeRange] = useState(24);
  const [crosshairT, setCrosshairT] = useState(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomStart, setZoomStart] = useState(null);
  const [customRange, setCustomRange] = useState(null);
  const [userChangedRange, setUserChangedRange] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedCMEId, setSelectedCMEId] = useState(null);

  const allCMEs = cmes || [];
  const magData = magDataProp || [];
  const stereoData = stereoDataProp || [];
  const loading = !classifications && !magDataProp;

  // Default selection: pick the active/ongoing CME (highest-priority non-passed)
  useEffect(() => {
    if (selectedCMEId || !allCMEs.length) return;
    // Prefer ARRIVED/STORM_ACTIVE > IMMINENT > INBOUND > WATCH
    const priority = { STORM_ACTIVE: 6, ARRIVED: 5, IMMINENT: 4, INBOUND: 3, WATCH: 2, QUIET: 1 };
    const sorted = [...allCMEs].sort((a, b) => (priority[b.state?.current] || 0) - (priority[a.state?.current] || 0));
    if (sorted.length) setSelectedCMEId(sorted[0].id);
  }, [allCMEs, selectedCMEId]);

  // Derive data for the selected CME
  const selectedCME = allCMEs.find(c => c.id === selectedCMEId) || null;
  const selectedState = selectedCME?.state?.current || '';
  const isPreArrival = ['WATCH', 'INBOUND', 'IMMINENT'].includes(selectedState);
  const classData = (selectedCMEId && classifications?.[selectedCMEId]) || null;

  // Plot data: STEREO-A for pre-arrival, L1 for arrived/passed
  // Map stereo Bn→bz, Bt→bt, Br→bx for plot compatibility
  const plotData = isPreArrival ? stereoData.map(d => ({
    time: d.time, bz: d.bn, by: null, bx: d.br, bt: d.bt, phi: null
  })) : magData;
  const plotLabel = isPreArrival ? 'STEREO-A (RTN)' : 'L1 (GSM)';

  // Highlight window as primitive timestamps (not object refs)
  const hlStart = classData?.classification_window?.start
    ? new Date(classData.classification_window.start).getTime() : null;
  const rawHlEnd = classData?.classification_window?.end
    ? new Date(classData.classification_window.end).getTime() : null;
  const progress = classData?.signatures?.structure_progress_pct || 0;
  // End logic: null end = "to now + buffer", ongoing rope = "to now + buffer"
  // +5min buffer ensures hlEnd never equals tMax exactly (which causes full-dim)
  const effectiveHlEnd = hlStart
    ? (rawHlEnd && progress > 120 ? rawHlEnd : Date.now() + 5 * 60000)
    : null;

  const handleZoomClick = useCallback((t) => {
    if (!zoomStart) {
      setZoomStart(t);
    } else {
      const t1 = Math.min(zoomStart, t);
      const t2 = Math.max(zoomStart, t);
      setCustomRange([t1, t2]);
      setZoomStart(null);
      setZoomMode(false);
      setUserChangedRange(true);
    }
  }, [zoomStart]);

  const resetZoom = () => {
    setCustomRange(null);
    setZoomStart(null);
    setZoomMode(false);
  };

  // Calculate actual time range — auto-expand to show classification window on initial load
  const ejectaStart = classData?.classification_window?.start;
  const classWindowStart = hlStart;
  const classWindowEnd = effectiveHlEnd;

  let actualRange;
  if (customRange) {
    actualRange = customRange;
  } else if (!userChangedRange && classWindowStart) {
    // Auto-scale to show the full classification window on initial view
    const windowEnd = classWindowEnd || Date.now();
    // Start 2h before window, end 2h after window or now (whichever is later)
    actualRange = [
      classWindowStart - 2 * 3600000,
      Math.max(windowEnd + 2 * 3600000, Date.now())
    ];
  } else {
    actualRange = [Date.now() - timeRange * 3600000, Date.now()];
  }
  
  if (loading) {
    return (
      <div style={{ padding: 20, fontFamily: FONT, color: C.textDim, background: C.bg, height: '100%' }}>
        Loading classification data...
      </div>
    );
  }
  
  return (
    <div style={{
      background: C.bg,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT,
    }}>
      {/* Header with controls */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.grid}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Annotations toggle */}
          <ToggleButton
            label="φ Annotations"
            active={showAnnotations}
            onClick={() => setShowAnnotations(!showAnnotations)}
            color={C.phi}
          />
          
          {/* Time range */}
          {!customRange && TIME_RANGES.map(r => (
            <ToggleButton
              key={r.hours}
              label={r.label}
              active={timeRange === r.hours && !zoomMode}
              onClick={() => { setTimeRange(r.hours); resetZoom(); setUserChangedRange(true); }}
              color={C.phi}
            />
          ))}
          
          {/* Zoom controls */}
          <ToggleButton
            label="🔍 Zoom"
            active={zoomMode}
            onClick={() => { setZoomMode(!zoomMode); setZoomStart(null); }}
            color="#ffaa33"
          />
          
          {(customRange || zoomMode) && (
            <ToggleButton
              label="Reset"
              active={false}
              onClick={resetZoom}
              color="#ee5577"
            />
          )}
        </div>
      </div>
      
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Plots area - top 70% */}
        <div style={{ flex: 7, display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 10px 0', minHeight: 0 }}>
          <BzPlot
            data={plotData}
            timeRange={actualRange}
            ejectaStart={ejectaStart}
            hlStart={hlStart}
            hlEnd={effectiveHlEnd}
            crosshairT={zoomMode ? null : crosshairT}
            onCrosshair={zoomMode ? handleZoomClick : setCrosshairT}
            zoomMode={zoomMode}
            zoomStart={zoomStart}
            plotLabel={plotLabel}
          />
          <ByPlot
            data={plotData}
            timeRange={actualRange}
            ejectaStart={ejectaStart}
            hlStart={hlStart}
            hlEnd={effectiveHlEnd}
            crosshairT={zoomMode ? null : crosshairT}
            onCrosshair={zoomMode ? handleZoomClick : setCrosshairT}
            zoomMode={zoomMode}
            zoomStart={zoomStart}
            plotLabel={plotLabel}
          />
          {!isPreArrival && (
            <PhiPlot
              data={plotData}
              timeRange={actualRange}
              ejectaStart={ejectaStart}
              hlStart={hlStart}
              hlEnd={effectiveHlEnd}
              crosshairT={zoomMode ? null : crosshairT}
              onCrosshair={zoomMode ? handleZoomClick : setCrosshairT}
              zoomMode={zoomMode}
              zoomStart={zoomStart}
              showAnnotations={showAnnotations}
              plotLabel={plotLabel}
            />
          )}
        </div>

        {/* Classification panel - bottom 30% */}
        {/* Classification panel — bottom 30% */}
        <div style={{ flex: 3, padding: '4px 10px 6px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ClassificationBox
            classData={classData}
            metadata={classificationMetadata}
            cmeId={selectedCMEId}
            cme={selectedCME}
          />
          {/* CME Selector Buttons */}
          {allCMEs.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {allCMEs.map((cme, i) => {
                const colors = ['#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', '#FF0080', '#0080FF', '#FF8000', '#80FF00'];
                const col = colors[i % colors.length];
                const isSelected = cme.id === selectedCMEId;
                const label = `CME ${i + 1}`;
                const stateLabel = cme.state?.current || '?';
                return (
                  <button key={cme.id} onClick={() => {
                    setSelectedCMEId(cme.id);
                    setUserChangedRange(false); // reset to auto-expand for new CME
                    setCustomRange(null);
                  }} style={{
                    background: isSelected ? `${col}22` : 'transparent',
                    border: `1px solid ${isSelected ? col : '#1a2a3a'}`,
                    color: isSelected ? col : '#556677',
                    padding: '2px 8px', borderRadius: 3, fontSize: 8, fontFamily: 'DejaVu Sans Mono, Consolas, monospace',
                    cursor: 'pointer', fontWeight: isSelected ? 700 : 400, letterSpacing: 0.3,
                  }}>
                    {label} · {stateLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
      border: `1px solid ${active ? color : C.grid}`,
      color: active ? color : C.textDim,
      padding: '3px 8px',
      fontSize: 8,
      fontFamily: FONT,
      cursor: 'pointer',
      borderRadius: 2,
      letterSpacing: 0.5,
      fontWeight: active ? 700 : 400,
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

// Bz Plot Component
function BzPlot({ data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, onCrosshair, zoomMode, zoomStart, plotLabel }) {
  const canvasRef = useRef(null);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const W = rect.width;
    const H = rect.height;
    const PAD = { l: 40, r: 10, t: 4, b: 12 };
    const pW = W - PAD.l - PAD.r;
    const pH = H - PAD.t - PAD.b;
    
    // Clear
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, W, H);
    
    // Filter data to time range
    const [tMin, tMax] = timeRange;
    const visData = data.filter(d => d.time >= tMin && d.time <= tMax);
    
    if (visData.length === 0) {
      ctx.fillStyle = C.textDim;
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('No data', W/2, H/2);
      return;
    }
    
    // Y scale — auto-fit to data with small padding, no forced ±20
    const bzVals = visData.map(d => d.bz).filter(v => v !== null && !isNaN(v));
    const btVals = visData.map(d => d.bt).filter(v => v !== null && !isNaN(v));
    const dataMin = bzVals.length ? Math.min(...bzVals) : -5;
    const dataMax = Math.max(...bzVals, ...btVals, 0);
    const yMin = Math.min(dataMin - 3, -5);
    const yMax = Math.max(dataMax + 3, 5);
    const yScale = (v) => PAD.t + pH - ((v - yMin) / (yMax - yMin)) * pH;
    const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * pW;
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.4;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + (pH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
    }
    
    // Zero line
    if (yMin < 0 && yMax > 0) {
      const y0 = yScale(0);
      ctx.strokeStyle = C.zero;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y0);
      ctx.lineTo(PAD.l + pW, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // -5nT storm threshold
    if (yMin <= -5) {
      const y5 = yScale(-5);
      ctx.strokeStyle = C.storm_line;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y5);
      ctx.lineTo(PAD.l + pW, y5);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#663333';
      ctx.font = `8px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('-5 nT storm', W - PAD.r - 2, y5 - 2);
    }
    
    // Bt fill (faint)
    ctx.fillStyle = C.bt + '1F';  // Very low alpha
    ctx.beginPath();
    let btStarted = false;
    for (const d of visData) {
      if (d.bt === null || isNaN(d.bt)) continue;
      const x = xScale(d.time);
      const y = yScale(d.bt);
      const y0 = yScale(0);
      if (!btStarted) {
        ctx.moveTo(x, y0);
        btStarted = true;
      }
      ctx.lineTo(x, y);
    }
    if (btStarted) {
      ctx.lineTo(xScale(visData[visData.length-1].time), yScale(0));
      ctx.closePath();
      ctx.fill();
    }
    
    // South fill
    ctx.fillStyle = '#2a0a10CC';
    ctx.beginPath();
    let southStarted = false;
    for (const d of visData) {
      if (d.bz === null || isNaN(d.bz)) continue;
      const x = xScale(d.time);
      const y = d.bz <= 0 ? yScale(d.bz) : yScale(0);
      const y0 = yScale(0);
      if (!southStarted) {
        ctx.moveTo(x, y0);
        southStarted = true;
      }
      ctx.lineTo(x, y);
    }
    if (southStarted) {
      ctx.lineTo(xScale(visData[visData.length-1].time), yScale(0));
      ctx.closePath();
      ctx.fill();
    }
    
    // Plot Bz with color coding
    for (let i = 0; i < visData.length - 1; i++) {
      const d1 = visData[i];
      const d2 = visData[i + 1];
      if (d1.bz === null || d2.bz === null || isNaN(d1.bz) || isNaN(d2.bz)) continue;
      
      const x1 = xScale(d1.time);
      const y1 = yScale(d1.bz);
      const x2 = xScale(d2.time);
      const y2 = yScale(d2.bz);
      
      const midVal = (d1.bz + d2.bz) / 2;
      ctx.strokeStyle = midVal < 0 ? C.bz_south : C.bz_north;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Classification data highlight — uses primitive timestamps, persists across all views
    if (hlStart && hlEnd) {
      const dim = 'rgba(0,0,0,0.55)';
      if (hlEnd <= tMin || hlStart >= tMax) {
        ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, pW, pH);
      } else {
        if (hlStart > tMin) { ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, xScale(hlStart) - PAD.l, pH); }
        if (hlEnd < tMax) { ctx.fillStyle = dim; ctx.fillRect(xScale(hlEnd), PAD.t, PAD.l + pW - xScale(hlEnd), pH); }
        ctx.fillStyle = 'rgba(68,170,255,0.04)';
        ctx.fillRect(xScale(Math.max(hlStart, tMin)), PAD.t, xScale(Math.min(hlEnd, tMax)) - xScale(Math.max(hlStart, tMin)), pH);
      }
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(68,170,255,0.6)';
      if (hlStart > tMin && hlStart < tMax) { const x = xScale(hlStart); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      if (hlEnd > tMin && hlEnd < tMax) { const x = xScale(hlEnd); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // Shock label at highlight start
    if (hlStart && hlStart > tMin && hlStart < tMax) {
      const x = xScale(hlStart);
      const st = new Date(hlStart);
      ctx.fillStyle = C.shock;
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`shock ${st.getUTCHours().toString().padStart(2,'0')}:${st.getUTCMinutes().toString().padStart(2,'0')}`, x + 3, PAD.t + 10);
    }
    
    // Zoom preview
    if (zoomMode && zoomStart) {
      const x1 = xScale(zoomStart);
      ctx.fillStyle = 'rgba(68,170,255,0.15)';
      ctx.fillRect(x1, PAD.t, W - PAD.r - x1, pH);
    }
    
    // Crosshair
    if (crosshairT && crosshairT >= tMin && crosshairT <= tMax) {
      const x = xScale(crosshairT);
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + pH);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Find nearest point
      const nearest = visData.reduce((best, p) => {
        if (p.bz === null || isNaN(p.bz)) return best;
        return Math.abs(p.time - crosshairT) < Math.abs((best?.time || Infinity) - crosshairT) ? p : best;
      }, null);
      
      if (nearest && nearest.bz !== null && !isNaN(nearest.bz)) {
        const y = yScale(nearest.bz);
        const val = nearest.bz.toFixed(1);
        
        // Label background
        ctx.fillStyle = 'rgba(6,8,15,0.9)';
        const tw = ctx.measureText(val).width;
        const lx = Math.min(x + 4, W - PAD.r - tw - 4);
        ctx.fillRect(lx - 2, y - 9, tw + 6, 13);
        
        // Label text
        ctx.fillStyle = nearest.bz < 0 ? C.bz_south : C.bz_north;
        ctx.font = `8px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(val, lx, y);
        
        // Dot
        ctx.fillStyle = nearest.bz < 0 ? C.bz_south : C.bz_north;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Timestamp at bottom
      const d = new Date(crosshairT);
      const timeStr = `${d.getUTCFullYear()}-${(d.getUTCMonth()+1).toString().padStart(2,'0')}-${d.getUTCDate().toString().padStart(2,'0')} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} UTC`;
      ctx.fillStyle = C.text;
      ctx.font = `7px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, H - 2);
    }
    
    // Y-axis labels
    ctx.fillStyle = C.textDim;
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = yMin + (yMax - yMin) * (1 - i / 5);
      const y = PAD.t + (pH * i) / 5;
      ctx.fillText(val.toFixed(0), PAD.l - 5, y + 3);
    }
    
    // Label + current value — overlaid on plot, no separate title area
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(68,187,255,0.5)';
    ctx.fillText(plotLabel?.includes('STEREO') ? `Bn nT · ${plotLabel}` : 'Bz nT', PAD.l + 3, PAD.t + 10);
    const latest = visData[visData.length - 1];
    if (latest && latest.bz !== null && !isNaN(latest.bz)) {
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = latest.bz < 0 ? C.bz_south : C.bz_north;
      ctx.fillText(`${latest.bz > 0 ? '+' : ''}${latest.bz.toFixed(1)}`, W - PAD.r - 2, PAD.t + 10);
    }
    
  }, [data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, zoomMode, zoomStart, plotLabel]);
  
  useEffect(() => { draw(); }, [draw]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);
  
  function handlePointer(e) {
    if (!onCrosshair) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = 40;
    const PAD_R = 15;
    const pW = rect.width - PAD_L - PAD_R;
    const x = e.clientX - rect.left - PAD_L;
    const frac = Math.max(0, Math.min(1, x / pW));
    const [tMin, tMax] = timeRange;
    const t = tMin + frac * (tMax - tMin);
    if (zoomMode && e.type !== 'pointerdown') return;
    onCrosshair(t);
  }
  
  return (
    <div style={{ 
      background: C.panelBg, 
      border: `1px solid ${C.grid}`, 
      borderRadius: 3,
      flex: 1,
      minHeight: 0,
    }}>
      <canvas 
        ref={canvasRef} 
        onPointerMove={zoomMode ? undefined : handlePointer}
        onPointerLeave={() => !zoomMode && onCrosshair && onCrosshair(null)}
        onPointerDown={handlePointer}
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          cursor: zoomMode ? 'col-resize' : 'crosshair',
        }} 
      />
    </div>
  );
}

// By Plot Component  
function ByPlot({ data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, onCrosshair, zoomMode, zoomStart, plotLabel }) {
  const canvasRef = useRef(null);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const W = rect.width;
    const H = rect.height;
    const PAD = { l: 40, r: 10, t: 4, b: 12 };
    const pW = W - PAD.l - PAD.r;
    const pH = H - PAD.t - PAD.b;
    
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, W, H);
    
    const [tMin, tMax] = timeRange;
    const visData = data.filter(d => d.time >= tMin && d.time <= tMax);
    
    if (visData.length === 0) return;
    
    const byVals = visData.map(d => d.by).filter(v => v !== null && !isNaN(v));
    const yMin = Math.min(-15, Math.min(...byVals) - 2);
    const yMax = Math.max(15, Math.max(...byVals) + 2);
    const yScale = (v) => PAD.t + pH - ((v - yMin) / (yMax - yMin)) * pH;
    const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * pW;
    
    // E/W background bands
    const y0 = yScale(0);
    ctx.fillStyle = '#0a2a1a80';  // Green tint for dusk/east
    ctx.fillRect(PAD.l, PAD.t, pW, y0 - PAD.t);
    
    ctx.fillStyle = '#2a1a0580';  // Orange tint for dawn/west
    ctx.fillRect(PAD.l, y0, pW, PAD.t + pH - y0);
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.4;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + (pH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
    }
    
    // Zero line
    ctx.strokeStyle = '#2a4a3a';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y0);
    ctx.lineTo(PAD.l + pW, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Plot By with color coding
    for (let i = 0; i < visData.length - 1; i++) {
      const d1 = visData[i];
      const d2 = visData[i + 1];
      if (d1.by === null || d2.by === null || isNaN(d1.by) || isNaN(d2.by)) continue;
      
      const x1 = xScale(d1.time);
      const y1 = yScale(d1.by);
      const x2 = xScale(d2.time);
      const y2 = yScale(d2.by);
      
      const midVal = (d1.by + d2.by) / 2;
      ctx.strokeStyle = midVal >= 0 ? C.by_dusk : C.by_dawn;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Classification data highlight — primitive timestamps, persists across all views
    if (hlStart && hlEnd) {
      const dim = 'rgba(0,0,0,0.55)';
      if (hlEnd <= tMin || hlStart >= tMax) {
        ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, pW, pH);
      } else {
        if (hlStart > tMin) { ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, xScale(hlStart) - PAD.l, pH); }
        if (hlEnd < tMax) { ctx.fillStyle = dim; ctx.fillRect(xScale(hlEnd), PAD.t, PAD.l + pW - xScale(hlEnd), pH); }
        ctx.fillStyle = 'rgba(68,170,255,0.04)';
        ctx.fillRect(xScale(Math.max(hlStart, tMin)), PAD.t, xScale(Math.min(hlEnd, tMax)) - xScale(Math.max(hlStart, tMin)), pH);
      }
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(68,170,255,0.6)';
      if (hlStart > tMin && hlStart < tMax) { const x = xScale(hlStart); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      if (hlEnd > tMin && hlEnd < tMax) { const x = xScale(hlEnd); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // Shock label at highlight start
    if (hlStart && hlStart > tMin && hlStart < tMax) {
      const x = xScale(hlStart);
      const st = new Date(hlStart);
      ctx.fillStyle = C.shock;
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`shock ${st.getUTCHours().toString().padStart(2,'0')}:${st.getUTCMinutes().toString().padStart(2,'0')}`, x + 3, PAD.t + 10);
    }
    
    // Zoom preview
    if (zoomMode && zoomStart) {
      const x1 = xScale(zoomStart);
      ctx.fillStyle = 'rgba(68,170,255,0.15)';
      ctx.fillRect(x1, PAD.t, W - PAD.r - x1, pH);
    }
    
    // Crosshair
    if (crosshairT && crosshairT >= tMin && crosshairT <= tMax) {
      const x = xScale(crosshairT);
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + pH);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const nearest = visData.reduce((best, p) => {
        if (p.by === null || isNaN(p.by)) return best;
        return Math.abs(p.time - crosshairT) < Math.abs((best?.time || Infinity) - crosshairT) ? p : best;
      }, null);
      
      if (nearest && nearest.by !== null && !isNaN(nearest.by)) {
        const y = yScale(nearest.by);
        const val = nearest.by.toFixed(1);
        
        ctx.fillStyle = 'rgba(6,8,15,0.9)';
        const tw = ctx.measureText(val).width;
        const lx = Math.min(x + 4, W - PAD.r - tw - 4);
        ctx.fillRect(lx - 2, y - 9, tw + 6, 13);
        
        ctx.fillStyle = nearest.by >= 0 ? C.by_dusk : C.by_dawn;
        ctx.font = `8px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(val, lx, y);
        
        ctx.fillStyle = nearest.by >= 0 ? C.by_dusk : C.by_dawn;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Y-axis
    ctx.fillStyle = C.textDim;
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = yMin + (yMax - yMin) * (1 - i / 5);
      const y = PAD.t + (pH * i) / 5;
      ctx.fillText(val.toFixed(0), PAD.l - 5, y + 3);
    }
    
    // Label + current value
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,170,51,0.5)';
    ctx.fillText(plotLabel?.includes('STEREO') ? `Bt nT · ${plotLabel}` : 'By nT', PAD.l + 3, PAD.t + 10);
    const latest = visData[visData.length - 1];
    if (latest && latest.by !== null && !isNaN(latest.by)) {
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = latest.by >= 0 ? C.by_dusk : C.by_dawn;
      ctx.fillText(`${latest.by > 0 ? '+' : ''}${latest.by.toFixed(1)}`, W - PAD.r - 2, PAD.t + 10);
    }
    
  }, [data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, zoomMode, zoomStart, plotLabel]);
  
  useEffect(() => { draw(); }, [draw]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);
  
  function handlePointer(e) {
    if (!onCrosshair) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = 40;
    const PAD_R = 15;
    const pW = rect.width - PAD_L - PAD_R;
    const x = e.clientX - rect.left - PAD_L;
    const frac = Math.max(0, Math.min(1, x / pW));
    const [tMin, tMax] = timeRange;
    const t = tMin + frac * (tMax - tMin);
    if (zoomMode && e.type !== 'pointerdown') return;
    onCrosshair(t);
  }
  
  return (
    <div style={{ 
      background: C.panelBg, 
      border: `1px solid ${C.grid}`, 
      borderRadius: 3,
      flex: 1,
      minHeight: 0,
    }}>
      <canvas 
        ref={canvasRef}
        onPointerMove={zoomMode ? undefined : handlePointer}
        onPointerLeave={() => !zoomMode && onCrosshair && onCrosshair(null)}
        onPointerDown={handlePointer}
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          cursor: zoomMode ? 'col-resize' : 'crosshair',
        }} 
      />
    </div>
  );
}

// Phi Plot Component
function PhiPlot({ data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, onCrosshair, zoomMode, zoomStart, showAnnotations, plotLabel }) {
  const canvasRef = useRef(null);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const W = rect.width;
    const H = rect.height;
    const PAD = { l: 40, r: 10, t: 4, b: 14 };
    const pW = W - PAD.l - PAD.r;
    const pH = H - PAD.t - PAD.b;
    
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, W, H);
    
    const [tMin, tMax] = timeRange;
    const visData = data.filter(d => d.time >= tMin && d.time <= tMax);
    
    if (visData.length === 0) return;
    
    const yMin = -10;
    const yMax = 370;
    const yScale = (v) => PAD.t + pH - ((v - yMin) / (yMax - yMin)) * pH;
    const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * pW;
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.4;
    [0, 90, 180, 270, 360].forEach(deg => {
      const y = yScale(deg);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
    });
    
    // 0° north line
    const y0 = yScale(0);
    ctx.strokeStyle = '#44cc88';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y0);
    ctx.lineTo(PAD.l + pW, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#226633';
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('0° north', W - PAD.r - 2, y0 - 2);
    
    // 180° south line
    const y180 = yScale(180);
    ctx.strokeStyle = C.storm_line;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y180);
    ctx.lineTo(PAD.l + pW, y180);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#663333';
    ctx.fillText('180° south', W - PAD.r - 2, y180 - 2);
    
    // Plot phi
    ctx.strokeStyle = C.phi;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const d of visData) {
      if (d.phi === null || isNaN(d.phi)) continue;
      const x = xScale(d.time);
      const y = yScale(d.phi);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Annotations (if enabled)
    if (showAnnotations) {
      // Detect rapid phi changes
      const phiChanges = detectPhiChanges(visData);
      for (const evt of phiChanges) {
        const x = xScale(evt.time);
        ctx.strokeStyle = evt.color;
        ctx.lineWidth = evt.width;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, PAD.t + pH);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = evt.textColor;
        ctx.font = `7px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(evt.label, x + 2, PAD.t + 10);
      }
    }
    
    // Classification data highlight — primitive timestamps, persists across all views
    if (hlStart && hlEnd) {
      const dim = 'rgba(0,0,0,0.55)';
      if (hlEnd <= tMin || hlStart >= tMax) {
        ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, pW, pH);
      } else {
        if (hlStart > tMin) { ctx.fillStyle = dim; ctx.fillRect(PAD.l, PAD.t, xScale(hlStart) - PAD.l, pH); }
        if (hlEnd < tMax) { ctx.fillStyle = dim; ctx.fillRect(xScale(hlEnd), PAD.t, PAD.l + pW - xScale(hlEnd), pH); }
        ctx.fillStyle = 'rgba(68,170,255,0.04)';
        ctx.fillRect(xScale(Math.max(hlStart, tMin)), PAD.t, xScale(Math.min(hlEnd, tMax)) - xScale(Math.max(hlStart, tMin)), pH);
      }
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(68,170,255,0.6)';
      if (hlStart > tMin && hlStart < tMax) { const x = xScale(hlStart); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      if (hlEnd > tMin && hlEnd < tMax) { const x = xScale(hlEnd); ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + pH); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // Shock label at highlight start
    if (hlStart && hlStart > tMin && hlStart < tMax) {
      const x = xScale(hlStart);
      const st = new Date(hlStart);
      ctx.fillStyle = C.shock;
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`shock ${st.getUTCHours().toString().padStart(2,'0')}:${st.getUTCMinutes().toString().padStart(2,'0')}`, x + 3, PAD.t + 10);
    }
    
    // Zoom preview
    if (zoomMode && zoomStart) {
      const x1 = xScale(zoomStart);
      ctx.fillStyle = 'rgba(68,170,255,0.15)';
      ctx.fillRect(x1, PAD.t, W - PAD.r - x1, pH);
    }
    
    // Crosshair
    if (crosshairT && crosshairT >= tMin && crosshairT <= tMax) {
      const x = xScale(crosshairT);
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + pH);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const nearest = visData.reduce((best, p) => {
        if (p.phi === null || isNaN(p.phi)) return best;
        return Math.abs(p.time - crosshairT) < Math.abs((best?.time || Infinity) - crosshairT) ? p : best;
      }, null);
      
      if (nearest && nearest.phi !== null && !isNaN(nearest.phi)) {
        const y = yScale(nearest.phi);
        const val = nearest.phi.toFixed(0) + '°';
        
        ctx.fillStyle = 'rgba(6,8,15,0.9)';
        const tw = ctx.measureText(val).width;
        const lx = Math.min(x + 4, W - PAD.r - tw - 4);
        ctx.fillRect(lx - 2, y - 9, tw + 6, 13);
        
        ctx.fillStyle = C.phi;
        ctx.font = `8px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(val, lx, y);
        
        ctx.fillStyle = C.phi;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Y-axis
    ctx.fillStyle = C.phi;
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'right';
    [0, 90, 180, 270, 360].forEach(deg => {
      const y = yScale(deg);
      ctx.fillText(deg + '°', PAD.l - 5, y + 3);
    });
    
    // Label + current value
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(170,136,255,0.5)';
    ctx.fillText('φ GSM', PAD.l + 3, PAD.t + 10);
    const latest = visData[visData.length - 1];
    if (latest && latest.phi !== null && !isNaN(latest.phi)) {
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.phi;
      ctx.fillText(latest.phi.toFixed(0) + '°', W - PAD.r - 2, PAD.t + 10);
    }
    
  }, [data, timeRange, ejectaStart, hlStart, hlEnd, crosshairT, zoomMode, zoomStart, showAnnotations, plotLabel]);
  
  useEffect(() => { draw(); }, [draw]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);
  
  function handlePointer(e) {
    if (!onCrosshair) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = 40;
    const PAD_R = 15;
    const pW = rect.width - PAD_L - PAD_R;
    const x = e.clientX - rect.left - PAD_L;
    const frac = Math.max(0, Math.min(1, x / pW));
    const [tMin, tMax] = timeRange;
    const t = tMin + frac * (tMax - tMin);
    if (zoomMode && e.type !== 'pointerdown') return;
    onCrosshair(t);
  }
  
  return (
    <div style={{ 
      background: C.panelBg, 
      border: `1px solid ${C.grid}`, 
      borderRadius: 3,
      flex: 1,
      minHeight: 0,
    }}>
      <canvas 
        ref={canvasRef}
        onPointerMove={zoomMode ? undefined : handlePointer}
        onPointerLeave={() => !zoomMode && onCrosshair && onCrosshair(null)}
        onPointerDown={handlePointer}
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          cursor: zoomMode ? 'col-resize' : 'crosshair',
        }} 
      />
    </div>
  );
}

// Detect phi changes for annotations (simplified version)
function detectPhiChanges(data) {
  const changes = [];
  const windowSize = 30; // 30 minutes
  
  for (let i = windowSize; i < data.length - windowSize; i++) {
    const before = data.slice(i - windowSize, i).filter(d => d.phi !== null);
    const after = data.slice(i, i + windowSize).filter(d => d.phi !== null);
    
    if (before.length < 10 || after.length < 10) continue;
    
    const phiBefore = before.reduce((sum, d) => sum + d.phi, 0) / before.length;
    const phiAfter = after.reduce((sum, d) => sum + d.phi, 0) / after.length;
    
    let delta = phiAfter - phiBefore;
    // Handle wrap-around
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    const absDelta = Math.abs(delta);
    
    if (absDelta > 90) {
      // Check for HCS (Bx flip)
      const bxBefore = before.filter(d => d.bx !== null).map(d => d.bx);
      const bxAfter = after.filter(d => d.bx !== null).map(d => d.bx);
      
      if (bxBefore.length > 5 && bxAfter.length > 5) {
        const avgBxBefore = bxBefore.reduce((a, b) => a + b) / bxBefore.length;
        const avgBxAfter = bxAfter.reduce((a, b) => a + b) / bxAfter.length;
        
        if (Math.sign(avgBxBefore) !== 0 && Math.sign(avgBxAfter) !== 0 && 
            Math.sign(avgBxBefore) !== Math.sign(avgBxAfter) && absDelta >= 120 && absDelta <= 240) {
          changes.push({
            time: data[i].time,
            label: '↔ HCS',
            color: C.hcs,
            textColor: '#aabbcc',
            width: 2.5
          });
          i += windowSize; // Skip ahead
          continue;
        }
      }
      
      // Large rotation
      if (absDelta >= 150) {
        changes.push({
          time: data[i].time,
          label: '⚡ BOUNDARY',
          color: C.boundary,
          textColor: '#ffcc88',
          width: 3.4
        });
        i += windowSize;
      }
    }
  }
  
  return changes;
}

// Classification Box Component
function ClassificationBox({ classData, metadata, cmeId, cme: selectedCME }) {
  if (!classData || !classData.active) {
    let msg = 'No active CME for classification';
    let col = C.textDim;
    if (metadata?.active_cme_id && !classData) {
      msg = `CME detected: ${metadata.active_cme_id}\nClassification in progress...`;
      col = '#ffaa00';
    } else if (classData?.notes?.length) {
      msg = classData.notes.join('\n');
    }
    return (
      <div style={{ background: C.classBox, border: `1px solid ${C.grid}`, borderRadius: 3,
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: 10, color: col, textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{msg}</div>
      </div>
    );
  }

  const cur = classData.current || {};
  const sigs = classData.signatures || {};
  const bz = classData.bz_predictions || {};
  const conf = cur.confidence || 0;
  const confCol = conf >= 75 ? C.bz_north : conf >= 50 ? '#ffaa00' : C.bz_south;
  const auCol = bz.aurora_potential === 'EXTREME' ? C.bz_south :
                bz.aurora_potential === 'EXCELLENT' ? '#ffaa00' :
                bz.aurora_potential === 'GOOD' ? C.bz_north : C.textDim;

  const Row = ({ label, value, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 9, lineHeight: 1.2, padding: '1px 0' }}>
      <span style={{ color: C.textDim, whiteSpace: 'nowrap', marginRight: 6 }}>{label}</span>
      <span style={{ color: color || C.text, fontWeight: color ? 600 : 400, whiteSpace: 'nowrap', textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      background: C.classBox, border: `1px solid ${C.grid}`, borderRadius: 3,
      padding: '6px 10px', fontFamily: FONT, height: '100%',
      display: 'flex', gap: 10, overflow: 'hidden',
    }}>
      {/* COL 1: Featured BS type box */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 76, flexShrink: 0 }}>
        <div style={{
          border: `2px solid ${confCol}`, borderRadius: 4,
          width: 66, height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.03)',
        }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: 2 }}>
            {cur.bs_type && cur.bs_type !== 'unknown' ? cur.bs_type : 'TBD'}
          </span>
        </div>
        <div style={{ fontSize: 7, color: C.textDim, marginTop: 3, textAlign: 'center', lineHeight: 1.2, maxWidth: 76 }}>
          {cur.bs_type_full || ''}
        </div>
        {selectedCME && ['ARRIVED', 'STORM_ACTIVE'].includes(selectedCME.state?.current) && (() => {
          const h = selectedCME.state?.history?.find(h => h.to === 'ARRIVED');
          if (!h) return null;
          try {
            const d = new Date(h.timestamp);
            return <div style={{ fontSize: 6, color: '#44ddaa', marginTop: 1 }}>Arrived {d.getUTCMonth()+1}/{d.getUTCDate()} {String(d.getUTCHours()).padStart(2,'0')}:{String(d.getUTCMinutes()).padStart(2,'0')} UTC</div>;
          } catch { return null; }
        })()}
        {cmeId && <div style={{ fontSize: 6, color: C.textFaint, marginTop: 1, letterSpacing: 0.5 }}>{cmeId}</div>}
      </div>

      {/* COL 2: Short fields — compact labels + values */}
      <div style={{ flex: 0.7, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <div style={{ flex: 1, background: C.progressBar, height: 3, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ background: confCol, height: '100%', width: `${conf}%` }} />
          </div>
          <span style={{ fontSize: 9, color: confCol, fontWeight: 600, whiteSpace: 'nowrap' }}>{conf.toFixed(0)}%</span>
        </div>
        <Row label="Kp" value={bz.kp_estimate} color={
          (() => { const k = parseInt(bz.kp_estimate); return k >= 7 ? '#ff6633' : k >= 5 ? '#ffaa00' : k >= 3 ? C.bz_north : C.textDim; })()
        } />
        <Row label="Aurora" value={bz.aurora_potential} color={auCol} />
        {bz.peak_bz_estimate != null && <Row label="Peak" value={`${bz.peak_bz_estimate.toFixed(1)} nT`} color={C.bz_south} />}
        {bz.flux_rope_duration_hours != null && <Row label="Rope" value={`~${Number(bz.flux_rope_duration_hours).toFixed(0)}h`} />}
        {sigs.structure_progress_pct != null && <Row label="Struct" value={`${sigs.structure_progress_pct > 100 ? 'passed' : sigs.structure_progress_pct.toFixed(0) + '%'}${cur.locked ? ' locked' : ''}`} />}
      </div>

      {/* COL 3: Longer fields — timing, trend, impact */}
      <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, minWidth: 0 }}>
        {/* Conditions trend — most actionable forward-looking signal */}
        {cur.bs_type && cur.bs_type !== 'unknown' && (() => {
          const prog = sigs.structure_progress_pct || 0;
          const type = cur.bs_type;
          // South-leading types (SEN/SWN/ESW/WSE): worsening early, improving late
          // North-leading types (NES/NWS): improving early, worsening mid/late
          const southLeading = ['SEN', 'SWN', 'ESW', 'WSE'].includes(type);
          let trend, trendCol;
          if (prog > 100) { trend = 'Subsiding'; trendCol = C.bz_north; }
          else if (prog > 75) { trend = southLeading ? 'Improving' : 'Peak storm'; trendCol = southLeading ? C.bz_north : C.bz_south; }
          else if (prog > 40) { trend = southLeading ? 'Peak storm' : 'Worsening'; trendCol = southLeading ? C.bz_south : '#ffaa00'; }
          else if (prog > 10) { trend = southLeading ? 'Worsening' : 'Improving'; trendCol = southLeading ? '#ffaa00' : C.bz_north; }
          else { trend = 'Early passage'; trendCol = '#ffaa00'; }
          return <Row label="Trend" value={trend} color={trendCol} />;
        })()}
        {(bz.duration_hours_low != null || bz.duration_hours_high != null) &&
          <Row label="-Bz duration" value={`${bz.duration_hours_low?.toFixed(1)}–${bz.duration_hours_high?.toFixed(1)} hr`} color={C.bz_south} />}
        {sigs.bz_onset_timing && <Row label="-Bz onset" value={sigs.bz_onset_timing} />}
        <Row label="Chirality" value={cur.chirality} />
        {bz.description && (
          <div style={{ fontSize: 8, color: C.text, background: C.panelBg, padding: '3px 5px', borderRadius: 2, lineHeight: 1.2, marginTop: 1 }}>
            {bz.description}
          </div>
        )}
      </div>
    </div>
  );
}

class ClassificationErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 20, color: '#ee5577', fontFamily: 'monospace', background: '#06080f', height: '100%', whiteSpace: 'pre-wrap', fontSize: 11 }}>
        Classification tab error:{'\n'}{String(this.state.error?.message || this.state.error)}{'\n'}{String(this.state.error?.stack || '').slice(0, 500)}
      </div>
    );
    return this.props.children;
  }
}

function CMEClassificationTabSafe(props) {
  return <ClassificationErrorBoundary><CMEClassificationTab {...props} /></ClassificationErrorBoundary>;
}

export default CMEClassificationTabSafe;
