import { useState, useEffect, useRef } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#04060d',
  plotBg: '#02040b',
  border: '#0d1525',
  grid: 'rgba(30,45,70,0.4)',
  zero: 'rgba(60,90,120,0.3)',
  text: '#e0e6ed',
  textDim: '#8a9aaa',
  bz_south: '#ee5577',
  bz_north: '#44ddaa',
  by_east: '#4488ff',
  by_west: '#ff8800',
  phi: '#44aaff',
  phi_toward: 'rgba(238,85,119,0.12)',
  phi_away: 'rgba(68,170,255,0.12)',
  classBox: '#0a0e18',
  progressBar: '#1a2a3a',
  progressFill: '#44aaff',
};

const TIME_RANGES = [
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '48H', hours: 48 },
];

function CMEClassificationTab({ activeCME, classification }) {
  const [timeRange, setTimeRange] = useState(24);
  const [magData, setMagData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch L1 magnetic field data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/night-watch/data/sw_mag_7day.json?t=${Date.now()}`);
        if (!res.ok) throw new Error('Failed to load mag data');
        const data = await res.json();
        setMagData(parseMagData(data));
        setLoading(false);
      } catch (err) {
        console.error('Failed to load mag data:', err);
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  if (loading) {
    return (
      <div style={{ padding: 20, fontFamily: FONT, color: C.textDim }}>
        Loading classification data...
      </div>
    );
  }
  
  if (!activeCME) {
    return (
      <div style={{ padding: 20, fontFamily: FONT, color: C.textDim }}>
        No active CME for classification
      </div>
    );
  }
  
  const classData = classification || {};
  const isActive = classData.active === true;
  
  return (
    <div style={{
      background: C.bg,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT,
    }}>
      {/* Header with time range controls */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 11, color: C.textDim, letterSpacing: 0.5 }}>
          L1 • DSCOVR + WIND • Aurora forecast • GSM real-time
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_RANGES.map(r => (
            <button
              key={r.hours}
              onClick={() => setTimeRange(r.hours)}
              style={{
                background: timeRange === r.hours ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${timeRange === r.hours ? C.phi : C.border}`,
                color: timeRange === r.hours ? C.phi : C.textDim,
                padding: '2px 8px',
                fontSize: 8,
                fontFamily: FONT,
                cursor: 'pointer',
                borderRadius: 2,
                letterSpacing: 0.5,
                fontWeight: timeRange === r.hours ? 700 : 400,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', gap: 12, padding: 12, overflow: 'auto' }}>
        {/* Plots column */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <BzPlot data={magData} timeRange={timeRange} ejectaStart={classData.classification_window?.start} />
          <ByPlot data={magData} timeRange={timeRange} ejectaStart={classData.classification_window?.start} />
          <PhiPlot data={magData} timeRange={timeRange} ejectaStart={classData.classification_window?.start} />
        </div>
        
        {/* Classification box column */}
        <div style={{ flex: 1, minWidth: 280, maxWidth: 380 }}>
          <ClassificationBox classData={classData} cmeId={activeCME.id} />
        </div>
      </div>
    </div>
  );
}

function BzPlot({ data, timeRange, ejectaStart }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    const pad = { l: 45, r: 15, t: 25, b: 30 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    
    // Clear
    ctx.fillStyle = C.plotBg;
    ctx.fillRect(0, 0, w, h);
    
    // Filter data to time range
    const now = Date.now();
    const cutoff = now - timeRange * 3600000;
    const visData = data.filter(d => d.time >= cutoff);
    
    if (visData.length === 0) return;
    
    // Y scale
    const bzVals = visData.map(d => d.bz).filter(v => v !== null);
    const yMin = Math.min(-20, Math.min(...bzVals) - 2);
    const yMax = Math.max(20, Math.max(...bzVals) + 2);
    const yScale = (v) => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const xScale = (t) => pad.l + ((t - cutoff) / (now - cutoff)) * plotW;
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = pad.t + (plotH * i) / ySteps;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }
    
    // Zero line
    if (yMin < 0 && yMax > 0) {
      const y0 = yScale(0);
      ctx.strokeStyle = C.zero;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y0);
      ctx.lineTo(pad.l + plotW, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Ejecta start marker
    if (ejectaStart) {
      const ejectaTime = new Date(ejectaStart).getTime();
      if (ejectaTime >= cutoff && ejectaTime <= now) {
        const x = xScale(ejectaTime);
        ctx.strokeStyle = 'rgba(255,200,100,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(255,200,100,0.8)';
        ctx.font = '9px ' + FONT;
        ctx.fillText('EJECTA', x + 3, pad.t + 12);
      }
    }
    
    // Plot Bz line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const d of visData) {
      if (d.bz === null) continue;
      const x = xScale(d.time);
      const y = yScale(d.bz);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = C.text;
    ctx.stroke();
    
    // Color code by polarity
    for (let i = 0; i < visData.length - 1; i++) {
      const d1 = visData[i];
      const d2 = visData[i + 1];
      if (d1.bz === null || d2.bz === null) continue;
      
      const x1 = xScale(d1.time);
      const y1 = yScale(d1.bz);
      const x2 = xScale(d2.time);
      const y2 = yScale(d2.bz);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = d1.bz < 0 ? C.bz_south : C.bz_north;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Y axis labels
    ctx.fillStyle = C.textDim;
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
      const val = yMin + (yMax - yMin) * (1 - i / ySteps);
      const y = pad.t + (plotH * i) / ySteps;
      ctx.fillText(val.toFixed(0), pad.l - 5, y + 4);
    }
    
    // Title
    ctx.fillStyle = C.text;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('Bz', pad.l, 15);
    
    ctx.fillStyle = C.textDim;
    ctx.font = '9px ' + FONT;
    ctx.fillText('GSM · nT', pad.l + 25, 15);
    
    // Current value
    const latest = visData[visData.length - 1];
    if (latest && latest.bz !== null) {
      const valStr = `${latest.bz > 0 ? '+' : ''}${latest.bz.toFixed(1)} nT`;
      ctx.font = '10px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillStyle = latest.bz < 0 ? C.bz_south : C.bz_north;
      ctx.fillText(valStr, w - pad.r, 15);
    }
    
    // Legend
    ctx.font = '8px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.bz_south;
    ctx.fillText('SOUTH = aurora fuel', pad.l, h - 8);
    
  }, [data, timeRange, ejectaStart]);
  
  return (
    <div style={{ 
      background: C.plotBg, 
      border: `1px solid ${C.border}`, 
      borderRadius: 3,
      height: 160,
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

function ByPlot({ data, timeRange, ejectaStart }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    const pad = { l: 45, r: 15, t: 25, b: 30 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    
    ctx.fillStyle = C.plotBg;
    ctx.fillRect(0, 0, w, h);
    
    const now = Date.now();
    const cutoff = now - timeRange * 3600000;
    const visData = data.filter(d => d.time >= cutoff);
    
    if (visData.length === 0) return;
    
    const byVals = visData.map(d => d.by).filter(v => v !== null);
    const yMin = Math.min(-15, Math.min(...byVals) - 2);
    const yMax = Math.max(15, Math.max(...byVals) + 2);
    const yScale = (v) => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const xScale = (t) => pad.l + ((t - cutoff) / (now - cutoff)) * plotW;
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = pad.t + (plotH * i) / ySteps;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }
    
    // Zero line
    const y0 = yScale(0);
    ctx.strokeStyle = C.zero;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.l, y0);
    ctx.lineTo(pad.l + plotW, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Ejecta marker
    if (ejectaStart) {
      const ejectaTime = new Date(ejectaStart).getTime();
      if (ejectaTime >= cutoff && ejectaTime <= now) {
        const x = xScale(ejectaTime);
        ctx.strokeStyle = 'rgba(255,200,100,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Plot By with color coding
    for (let i = 0; i < visData.length - 1; i++) {
      const d1 = visData[i];
      const d2 = visData[i + 1];
      if (d1.by === null || d2.by === null) continue;
      
      const x1 = xScale(d1.time);
      const y1 = yScale(d1.by);
      const x2 = xScale(d2.time);
      const y2 = yScale(d2.by);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = d1.by > 0 ? C.by_east : C.by_west;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Y axis
    ctx.fillStyle = C.textDim;
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
      const val = yMin + (yMax - yMin) * (1 - i / ySteps);
      const y = pad.t + (plotH * i) / ySteps;
      ctx.fillText(val.toFixed(0), pad.l - 5, y + 4);
    }
    
    // Title
    ctx.fillStyle = C.text;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('By', pad.l, 15);
    
    ctx.fillStyle = C.textDim;
    ctx.font = '9px ' + FONT;
    ctx.fillText('GSM · nT', pad.l + 23, 15);
    
    // Current value
    const latest = visData[visData.length - 1];
    if (latest && latest.by !== null) {
      const valStr = `${latest.by > 0 ? '+' : ''}${latest.by.toFixed(1)} nT`;
      ctx.font = '10px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillStyle = latest.by > 0 ? C.by_east : C.by_west;
      ctx.fillText(valStr, w - pad.r, 15);
    }
    
    // Legend
    ctx.font = '8px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.by_east;
    ctx.fillText('E DUSK', pad.l, h - 8);
    ctx.fillStyle = C.by_west;
    ctx.fillText('W DAWN', pad.l + 60, h - 8);
    
  }, [data, timeRange, ejectaStart]);
  
  return (
    <div style={{ 
      background: C.plotBg, 
      border: `1px solid ${C.border}`, 
      borderRadius: 3,
      height: 160,
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

function PhiPlot({ data, timeRange, ejectaStart }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    const pad = { l: 45, r: 15, t: 25, b: 30 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    
    ctx.fillStyle = C.plotBg;
    ctx.fillRect(0, 0, w, h);
    
    const now = Date.now();
    const cutoff = now - timeRange * 3600000;
    const visData = data.filter(d => d.time >= cutoff);
    
    if (visData.length === 0) return;
    
    const yMin = 0;
    const yMax = 360;
    const yScale = (v) => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const xScale = (t) => pad.l + ((t - cutoff) / (now - cutoff)) * plotW;
    
    // Sector shading
    const y180 = yScale(180);
    ctx.fillStyle = C.phi_toward;
    ctx.fillRect(pad.l, y180, plotW, yScale(360) - y180);
    
    ctx.fillStyle = C.phi_away;
    ctx.fillRect(pad.l, pad.t, plotW, y180 - pad.t);
    
    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let deg = 0; deg <= 360; deg += 90) {
      const y = yScale(deg);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }
    
    // 180° line
    ctx.strokeStyle = C.zero;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.l, y180);
    ctx.lineTo(pad.l + plotW, y180);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Ejecta marker
    if (ejectaStart) {
      const ejectaTime = new Date(ejectaStart).getTime();
      if (ejectaTime >= cutoff && ejectaTime <= now) {
        const x = xScale(ejectaTime);
        ctx.strokeStyle = 'rgba(255,200,100,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Plot phi
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.phi;
    ctx.beginPath();
    let started = false;
    for (const d of visData) {
      if (d.phi === null) continue;
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
    
    // Y axis
    ctx.fillStyle = C.textDim;
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'right';
    [0, 90, 180, 270, 360].forEach(deg => {
      const y = yScale(deg);
      ctx.fillText(deg + '°', pad.l - 5, y + 4);
    });
    
    // Title
    ctx.fillStyle = C.text;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('IMF Phi GSM (°)', pad.l, 15);
    
    // Current value
    const latest = visData[visData.length - 1];
    if (latest && latest.phi !== null) {
      ctx.font = '10px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.phi;
      ctx.fillText(latest.phi.toFixed(0) + '°', w - pad.r, 15);
    }
    
    // Legend
    ctx.font = '8px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.textDim;
    ctx.fillText('360° AWAY', pad.l, h - 18);
    ctx.fillText('180° TOWARD', pad.l, h - 8);
    
  }, [data, timeRange, ejectaStart]);
  
  return (
    <div style={{ 
      background: C.plotBg, 
      border: `1px solid ${C.border}`, 
      borderRadius: 3,
      height: 160,
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

function ClassificationBox({ classData, cmeId }) {
  if (!classData.active) {
    return (
      <div style={{
        background: C.classBox,
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        padding: 16,
        fontFamily: FONT,
      }}>
        <div style={{ fontSize: 12, color: C.textDim, textAlign: 'center', padding: '40px 0' }}>
          {classData.notes && classData.notes.length > 0 
            ? classData.notes[0] 
            : 'Classification pending'}
        </div>
      </div>
    );
  }
  
  const current = classData.current || {};
  const sigs = classData.signatures || {};
  const bz = classData.bz_predictions || {};
  
  const confidence = current.confidence || 0;
  const confidenceColor = confidence >= 75 ? C.bz_north : confidence >= 50 ? '#ffaa00' : C.bz_south;
  
  return (
    <div style={{
      background: C.classBox,
      border: `1px solid ${C.border}`,
      borderRadius: 3,
      padding: 16,
      fontFamily: FONT,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, marginBottom: 6 }}>
          {cmeId}
        </div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>
          {current.bs_type || 'UNKNOWN'}
        </div>
        <div style={{ fontSize: 10, color: C.textDim }}>
          {current.bs_type_full || 'Classification in progress'}
        </div>
      </div>
      
      {/* Confidence */}
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: 6,
          fontSize: 9,
          color: C.textDim,
        }}>
          <span>MATCH</span>
          <span style={{ color: confidenceColor, fontWeight: 600 }}>
            {confidence.toFixed(0)}%
          </span>
        </div>
        <div style={{ 
          background: C.progressBar, 
          height: 6, 
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            background: confidenceColor,
            height: '100%',
            width: `${confidence}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
      
      {/* Chirality */}
      {current.chirality && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Chirality</span>
          <span style={{ color: C.text }}>{current.chirality}</span>
        </div>
      )}
      
      {/* Structure progress */}
      {sigs.structure_progress_pct !== undefined && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Structure passed</span>
          <span style={{ color: C.text }}>{sigs.structure_progress_pct.toFixed(0)}%</span>
        </div>
      )}
      
      {/* Bz onset */}
      {sigs.bz_onset_timing && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Bz onset</span>
          <span style={{ color: C.text }}>{sigs.bz_onset_timing}</span>
        </div>
      )}
      
      {/* Aurora impact */}
      {bz.description && (
        <div style={{ 
          background: C.plotBg, 
          padding: 10, 
          borderRadius: 3,
          fontSize: 10,
          color: C.text,
          lineHeight: 1.5,
        }}>
          {bz.description}
        </div>
      )}
      
      {/* Aurora potential */}
      {bz.aurora_potential && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Aurora potential</span>
          <span style={{ 
            color: bz.aurora_potential === 'EXTREME' ? C.bz_south : 
                   bz.aurora_potential === 'EXCELLENT' ? '#ffaa00' :
                   bz.aurora_potential === 'GOOD' ? C.bz_north :
                   C.textDim,
            fontWeight: 600,
          }}>
            {bz.aurora_potential}
          </span>
        </div>
      )}
      
      {/* Kp estimate */}
      {bz.kp_estimate && bz.kp_estimate !== 'N/A' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Kp estimate</span>
          <span style={{ color: C.text }}>{bz.kp_estimate}</span>
        </div>
      )}
      
      {/* Duration */}
      {(bz.duration_hours_low || bz.duration_hours_high) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Duration (est)</span>
          <span style={{ color: C.text }}>
            {bz.duration_hours_low?.toFixed(1)}-{bz.duration_hours_high?.toFixed(1)} hr
          </span>
        </div>
      )}
      
      {/* Peak Bz */}
      {bz.peak_bz_estimate !== undefined && bz.peak_bz_estimate !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: C.textDim }}>Peak Bz (est)</span>
          <span style={{ color: C.bz_south }}>
            {bz.peak_bz_estimate.toFixed(1)} nT
          </span>
        </div>
      )}
      
      {/* Notes */}
      {classData.notes && classData.notes.length > 0 && (
        <div style={{ 
          fontSize: 8, 
          color: C.textDim, 
          borderTop: `1px solid ${C.border}`,
          paddingTop: 10,
          lineHeight: 1.4,
        }}>
          {classData.notes.map((note, i) => (
            <div key={i} style={{ marginBottom: 4 }}>• {note}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function parseMagData(raw) {
  if (!raw || !raw.columns || !raw.data) return [];
  
  const cols = raw.columns;
  const timeIdx = cols.indexOf('time');
  const bzIdx = cols.indexOf('bz');
  const byIdx = cols.indexOf('by');
  const phiIdx = cols.indexOf('phi');
  
  if (timeIdx === -1) return [];
  
  return raw.data.map(row => {
    try {
      const t = new Date(row[timeIdx]);
      if (isNaN(t.getTime())) return null;
      
      return {
        time: t.getTime(),
        bz: bzIdx >= 0 ? row[bzIdx] : null,
        by: byIdx >= 0 ? row[byIdx] : null,
        phi: phiIdx >= 0 ? row[phiIdx] : null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export default CMEClassificationTab;
