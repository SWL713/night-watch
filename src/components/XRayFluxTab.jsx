import { useState, useEffect, useRef, useCallback } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';

const C = {
  bg: '#06080f',
  panelBg: '#070b16',
  grid: '#0d1225',
  text: '#e0e6ed',
  textDim: '#445566',
  textFaint: '#334455',
  xrsB: '#ff4444',
  xrsA: '#4488ff',
  classX: '#ff6633',
  classM: '#ffaa44',
  classC: '#ffee88',
  classB: '#88aadd',
  classA: '#aaccff',
  crosshair: 'rgba(255,255,255,0.6)',
};

const TIME_RANGES = [
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '2D', hours: 48 },
  { label: '3D', hours: 72 },
  { label: '5D', hours: 120 },
  { label: '7D', hours: 168 },
];

const BASE = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data';

const THRESHOLDS = [
  { value: 1e-8, label: 'A', color: C.classA },
  { value: 1e-7, label: 'B', color: C.classB },
  { value: 1e-6, label: 'C', color: C.classC },
  { value: 1e-5, label: 'M', color: C.classM },
  { value: 1e-4, label: 'X', color: C.classX },
];

const Y_MIN = 1e-9;
const Y_MAX = 1e-3;

// --- Helpers ---

function flareClass(flux) {
  if (flux >= 1e-4) return 'X';
  if (flux >= 1e-5) return 'M';
  if (flux >= 1e-6) return 'C';
  if (flux >= 1e-7) return 'B';
  return 'A';
}

function flareClassColor(cls) {
  if (cls === 'X') return C.classX;
  if (cls === 'M') return C.classM;
  if (cls === 'C') return C.classC;
  if (cls === 'B') return C.classB;
  return C.classA;
}

function flareClassNumber(flux) {
  if (flux >= 1e-4) return (flux / 1e-4).toFixed(1);
  if (flux >= 1e-5) return (flux / 1e-5).toFixed(1);
  if (flux >= 1e-6) return (flux / 1e-6).toFixed(1);
  if (flux >= 1e-7) return (flux / 1e-7).toFixed(1);
  return (flux / 1e-8).toFixed(1);
}

function flareClassFull(flux) {
  return flareClass(flux) + flareClassNumber(flux);
}

function formatFlux(flux) {
  if (flux == null || isNaN(flux)) return '--';
  const exp = Math.floor(Math.log10(flux));
  const mantissa = flux / Math.pow(10, exp);
  return `${mantissa.toFixed(2)} \u00d7 10\u207b${Math.abs(exp)}`;
}

function formatUTC(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function formatUTCShort(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function radioBlackout(flux) {
  if (flux >= 1e-3) return 'R5';
  if (flux >= 5e-4) return 'R4';
  if (flux >= 1e-4) return 'R3';
  if (flux >= 5e-5) return 'R2';
  if (flux >= 1e-5) return 'R1';
  return 'None';
}

function parseXrayData(raw) {
  if (!raw || !raw.columns || !raw.data) return [];
  const cols = raw.columns;
  const iTime = cols.indexOf('time');
  const iLong = cols.indexOf('flux_long');
  const iShort = cols.indexOf('flux_short');
  if (iTime === -1) return [];
  return raw.data.map(row => {
    try {
      const t = new Date(row[iTime]);
      if (isNaN(t.getTime())) return null;
      return {
        time: t.getTime(),
        flux_long: iLong >= 0 ? row[iLong] : null,
        flux_short: iShort >= 0 ? row[iShort] : null,
      };
    } catch { return null; }
  }).filter(Boolean);
}

function parseFlareData(raw) {
  if (!raw) return [];
  // Support both array and {columns, data} format
  if (Array.isArray(raw)) {
    return raw.map(f => ({
      ...f,
      start_time: f.start_time ? new Date(f.start_time).getTime() : null,
      peak_time: f.peak_time ? new Date(f.peak_time).getTime() : null,
      end_time: f.end_time ? new Date(f.end_time).getTime() : null,
    })).filter(f => f.peak_time);
  }
  if (raw.columns && raw.data) {
    const cols = raw.columns;
    return raw.data.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      obj.start_time = obj.start_time ? new Date(obj.start_time).getTime() : null;
      obj.peak_time = obj.peak_time ? new Date(obj.peak_time).getTime() : null;
      obj.end_time = obj.end_time ? new Date(obj.end_time).getTime() : null;
      return obj;
    }).filter(f => f.peak_time);
  }
  return [];
}

// --- Toggle Button ---

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

// --- X-Ray Flux Plot (canvas) ---

function XRayPlot({ data, flares, timeRange, showXrsB, showXrsA, showFlares, crosshairT, onCrosshair, zoomMode, zoomStart }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { l: 48, r: 28, t: 6, b: 16 };
    const pW = W - PAD.l - PAD.r;
    const pH = H - PAD.t - PAD.b;

    // Clear
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, W, H);

    const [tMin, tMax] = timeRange;
    const visData = (data || []).filter(d => d.time >= tMin && d.time <= tMax);

    const logMin = Math.log10(Y_MIN);
    const logMax = Math.log10(Y_MAX);

    const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * pW;
    const yScale = (v) => {
      if (v == null || v <= 0) return null;
      const logV = Math.log10(v);
      return PAD.t + pH - ((logV - logMin) / (logMax - logMin)) * pH;
    };

    // Grid lines (one per log decade)
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let exp = -9; exp <= -3; exp++) {
      const y = yScale(Math.pow(10, exp));
      if (y == null) continue;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
    }

    // Threshold lines + labels on right
    for (const th of THRESHOLDS) {
      const y = yScale(th.value);
      if (y == null) continue;
      ctx.strokeStyle = th.color + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label on right side
      ctx.fillStyle = th.color;
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(th.label, PAD.l + pW + 4, y + 3);
    }

    // X-axis time labels
    ctx.fillStyle = C.textDim;
    ctx.font = `7px ${FONT}`;
    ctx.textAlign = 'center';
    const spanH = (tMax - tMin) / 3600000;
    const tickInterval = spanH <= 24 ? 60 : spanH <= 72 ? 360 : 1440;
    const tickMs = tickInterval * 60000;
    const firstTick = Math.ceil(tMin / tickMs) * tickMs;
    for (let t = firstTick; t <= tMax; t += tickMs) {
      const x = xScale(t);
      const d = new Date(t);
      const label = spanH <= 48
        ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      ctx.fillText(label, x, H - 3);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t + pH);
      ctx.lineTo(x, PAD.t + pH + 3);
      ctx.stroke();
    }

    // Y-axis labels (powers of 10)
    ctx.fillStyle = C.textDim;
    ctx.font = `7px ${FONT}`;
    ctx.textAlign = 'right';
    for (let exp = -9; exp <= -3; exp++) {
      const y = yScale(Math.pow(10, exp));
      if (y == null) continue;
      ctx.fillText(`10${exp < 0 ? '\u207b' : ''}${String(Math.abs(exp)).split('').map(c => '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'[c]).join('')}`, PAD.l - 4, y + 3);
    }

    if (visData.length === 0) {
      ctx.fillStyle = C.textDim;
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('No X-ray data', W / 2, H / 2);
      return;
    }

    // Flare annotations (behind data lines)
    if (showFlares && flares) {
      const mxFlares = flares.filter(f => {
        if (!f.peak_time || f.peak_time < tMin || f.peak_time > tMax) return false;
        const cls = f.class_type || (f.peak_flux ? flareClass(f.peak_flux) : '');
        return cls === 'M' || cls === 'X';
      });
      for (const f of mxFlares) {
        const x = xScale(f.peak_time);
        const cls = f.class_type || (f.peak_flux ? flareClass(f.peak_flux) : 'M');
        const color = cls === 'X' ? C.classX : C.classM;
        const label = f.class_label || (f.peak_flux ? flareClassFull(f.peak_flux) : cls);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, PAD.t + pH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = color;
        ctx.font = `bold 8px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 2, PAD.t + 10);
      }
    }

    // Draw XRS-B line (long wavelength)
    if (showXrsB) {
      ctx.strokeStyle = C.xrsB;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      let prevT = null;
      for (const d of visData) {
        if (d.flux_long == null || d.flux_long <= 0) { started = false; continue; }
        const x = xScale(d.time);
        const y = yScale(d.flux_long);
        if (y == null) { started = false; continue; }
        // Gap detection (5 min)
        if (prevT && (d.time - prevT) > 5 * 60000) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        prevT = d.time;
      }
      ctx.stroke();
    }

    // Draw XRS-A line (short wavelength)
    if (showXrsA) {
      ctx.strokeStyle = C.xrsA;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      let prevT = null;
      for (const d of visData) {
        if (d.flux_short == null || d.flux_short <= 0) { started = false; continue; }
        const x = xScale(d.time);
        const y = yScale(d.flux_short);
        if (y == null) { started = false; continue; }
        if (prevT && (d.time - prevT) > 5 * 60000) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        prevT = d.time;
      }
      ctx.stroke();
    }

    // NOW line
    const now = Date.now();
    if (now >= tMin && now <= tMax) {
      const x = xScale(now);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + pH);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `7px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('NOW', x + 2, PAD.t + 8);
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

      // Find nearest data point
      const nearest = visData.reduce((best, p) => {
        return Math.abs(p.time - crosshairT) < Math.abs((best?.time || Infinity) - crosshairT) ? p : best;
      }, null);

      if (nearest) {
        // XRS-B value
        if (showXrsB && nearest.flux_long != null && nearest.flux_long > 0) {
          const y = yScale(nearest.flux_long);
          if (y != null) {
            const val = nearest.flux_long.toExponential(1);
            ctx.fillStyle = 'rgba(6,8,15,0.9)';
            const tw = ctx.measureText(val).width;
            const lx = Math.min(x + 4, W - PAD.r - tw - 4);
            ctx.fillRect(lx - 2, y - 9, tw + 6, 13);
            ctx.fillStyle = C.xrsB;
            ctx.font = `8px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(val, lx, y);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // XRS-A value
        if (showXrsA && nearest.flux_short != null && nearest.flux_short > 0) {
          const y = yScale(nearest.flux_short);
          if (y != null) {
            const val = nearest.flux_short.toExponential(1);
            ctx.fillStyle = 'rgba(6,8,15,0.9)';
            const tw = ctx.measureText(val).width;
            const lx = Math.min(x + 4, W - PAD.r - tw - 4);
            ctx.fillRect(lx - 2, y - 9, tw + 6, 13);
            ctx.fillStyle = C.xrsA;
            ctx.font = `8px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(val, lx, y);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Timestamp at bottom
        const d = new Date(crosshairT);
        const timeStr = formatUTC(crosshairT);
        ctx.fillStyle = C.text;
        ctx.font = `7px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, H - 2);
      }
    }

    // Plot label overlay
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,100,100,0.5)';
    ctx.fillText('GOES X-Ray', PAD.l + 3, PAD.t + 12);

    // Current value (latest XRS-B)
    if (showXrsB && visData.length > 0) {
      const latest = [...visData].reverse().find(d => d.flux_long != null && d.flux_long > 0);
      if (latest) {
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = C.xrsB;
        ctx.fillText(flareClassFull(latest.flux_long), W - PAD.r - 2, PAD.t + 12);
      }
    }

  }, [data, flares, timeRange, showXrsB, showXrsA, showFlares, crosshairT, zoomMode, zoomStart]);

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
    const PAD_L = 48;
    const PAD_R = 28;
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

// --- Zoomed Flare Plot (canvas) ---

function FlareZoomPlot({ data, flare }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { l: 44, r: 24, t: 6, b: 16 };
    const pW = W - PAD.l - PAD.r;
    const pH = H - PAD.t - PAD.b;

    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, W, H);

    if (!flare || !flare.peak_time) {
      ctx.fillStyle = C.textDim;
      ctx.font = `9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('No flare selected', W / 2, H / 2);
      return;
    }

    const peakT = flare.peak_time;
    const tMin = peakT - 30 * 60000;
    const tMax = peakT + 30 * 60000;

    const visData = (data || []).filter(d => d.time >= tMin && d.time <= tMax);

    const logMin = Math.log10(Y_MIN);
    const logMax = Math.log10(Y_MAX);

    const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * pW;
    const yScale = (v) => {
      if (v == null || v <= 0) return null;
      const logV = Math.log10(v);
      return PAD.t + pH - ((logV - logMin) / (logMax - logMin)) * pH;
    };

    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let exp = -9; exp <= -3; exp++) {
      const y = yScale(Math.pow(10, exp));
      if (y == null) continue;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
    }

    // Threshold lines
    for (const th of THRESHOLDS) {
      const y = yScale(th.value);
      if (y == null) continue;
      ctx.strokeStyle = th.color + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + pW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = th.color;
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(th.label, PAD.l + pW + 3, y + 3);
    }

    // Y-axis labels
    ctx.fillStyle = C.textDim;
    ctx.font = `7px ${FONT}`;
    ctx.textAlign = 'right';
    for (let exp = -9; exp <= -3; exp++) {
      const y = yScale(Math.pow(10, exp));
      if (y == null) continue;
      ctx.fillText(`10${exp < 0 ? '\u207b' : ''}${String(Math.abs(exp)).split('').map(c => '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'[c]).join('')}`, PAD.l - 4, y + 3);
    }

    // X-axis time labels
    ctx.fillStyle = C.textDim;
    ctx.font = `7px ${FONT}`;
    ctx.textAlign = 'center';
    const tickMs = 5 * 60000; // every 5 min
    const firstTick = Math.ceil(tMin / tickMs) * tickMs;
    for (let t = firstTick; t <= tMax; t += tickMs) {
      const x = xScale(t);
      const d = new Date(t);
      ctx.fillText(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`, x, H - 3);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t + pH);
      ctx.lineTo(x, PAD.t + pH + 3);
      ctx.stroke();
    }

    // Draw XRS-B line
    if (visData.length > 0) {
      ctx.strokeStyle = C.xrsB;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (const d of visData) {
        if (d.flux_long == null || d.flux_long <= 0) { started = false; continue; }
        const x = xScale(d.time);
        const y = yScale(d.flux_long);
        if (y == null) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }

    // Peak marker
    const peakFlux = flare.peak_flux;
    if (peakFlux && peakFlux > 0) {
      const px = xScale(peakT);
      const py = yScale(peakFlux);
      if (py != null) {
        // Vertical dashed line at peak
        const cls = flare.class_type || flareClass(peakFlux);
        const color = flareClassColor(cls);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, PAD.t);
        ctx.lineTo(px, PAD.t + pH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Diamond marker at peak
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py - 5);
        ctx.lineTo(px + 4, py);
        ctx.lineTo(px, py + 5);
        ctx.lineTo(px - 4, py);
        ctx.closePath();
        ctx.fill();

        // Label
        const label = flare.class_label || (peakFlux ? flareClassFull(peakFlux) : cls);
        ctx.font = `bold 9px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(label, px + 6, py - 2);
      }
    }

    // Start/end markers
    if (flare.start_time && flare.start_time >= tMin && flare.start_time <= tMax) {
      const sx = xScale(flare.start_time);
      ctx.strokeStyle = '#44ddaa55';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD.t);
      ctx.lineTo(sx, PAD.t + pH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#44ddaa';
      ctx.font = `7px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('START', sx + 2, PAD.t + pH - 4);
    }

    if (flare.end_time && flare.end_time >= tMin && flare.end_time <= tMax) {
      const ex = xScale(flare.end_time);
      ctx.strokeStyle = '#44ddaa55';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(ex, PAD.t);
      ctx.lineTo(ex, PAD.t + pH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#44ddaa';
      ctx.font = `7px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('END', ex - 2, PAD.t + pH - 4);
    }

    // Plot label
    ctx.font = `bold 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,100,100,0.4)';
    ctx.fillText('Flare Detail', PAD.l + 3, PAD.t + 10);

  }, [data, flare]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

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
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

// --- Flare Data Card ---

function FlareCard({ flare }) {
  const Row = ({ label, value, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 9, lineHeight: 1.2, padding: '1px 0' }}>
      <span style={{ color: C.textDim, whiteSpace: 'nowrap', marginRight: 6 }}>{label}</span>
      <span style={{ color: color || C.text, fontWeight: color ? 600 : 400, whiteSpace: 'nowrap', textAlign: 'right' }}>{value}</span>
    </div>
  );

  if (!flare) {
    return (
      <div style={{
        background: '#0a0e18',
        border: `1px solid ${C.grid}`,
        borderRadius: 3,
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        padding: 10,
      }}>
        <div style={{ fontSize: 10, color: C.textDim, textAlign: 'center', lineHeight: 1.6 }}>
          No M/X flares in past 7 days
        </div>
      </div>
    );
  }

  const peakFlux = flare.peak_flux;
  const cls = flare.class_type || (peakFlux ? flareClass(peakFlux) : '?');
  const classLabel = flare.class_label || (peakFlux ? flareClassFull(peakFlux) : cls);
  const color = flareClassColor(cls);

  const isCompleted = flare.end_time != null;
  const status = isCompleted ? 'COMPLETED' : 'IN PROGRESS';
  const statusColor = isCompleted ? '#44ddaa' : '#ffaa44';

  const durationMin = (flare.start_time && flare.end_time)
    ? Math.round((flare.end_time - flare.start_time) / 60000)
    : null;

  return (
    <div style={{
      background: '#0a0e18',
      border: `1px solid ${C.grid}`,
      borderRadius: 3,
      flex: 1,
      fontFamily: FONT,
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      overflow: 'auto',
    }}>
      {/* Large class display */}
      <div style={{ textAlign: 'center', marginBottom: 2 }}>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: color,
          letterSpacing: 2,
          lineHeight: 1,
        }}>
          {classLabel}
        </div>
        <div style={{ fontSize: 7, color: C.textDim, marginTop: 2 }}>GOES X-RAY FLARE</div>
      </div>

      {/* Key-value rows */}
      <Row label="Status" value={status} color={statusColor} />
      <Row label="Start" value={formatUTCShort(flare.start_time)} />
      <Row label="Peak" value={formatUTCShort(flare.peak_time)} />
      <Row label="End" value={flare.end_time ? formatUTCShort(flare.end_time) : '--'} />
      {durationMin != null && <Row label="Duration" value={`${durationMin} min`} />}
      {peakFlux != null && <Row label="Peak flux" value={`${formatFlux(peakFlux)} W/m\u00b2`} />}
      {flare.satellite && <Row label="Satellite" value={flare.satellite} />}
      {flare.active_region && <Row label="Active region" value={`AR${flare.active_region}`} />}
      {flare.location && <Row label="Location" value={flare.location} />}
      <Row label="Radio blackout" value={radioBlackout(peakFlux)} color={peakFlux >= 1e-4 ? C.classX : peakFlux >= 1e-5 ? C.classM : C.textDim} />
      {flare.associated_cme && <Row label="Associated CME" value={flare.associated_cme} color="#44aaff" />}
    </div>
  );
}

// --- Main Component ---

export default function XRayFluxTab() {
  const [timeRange, setTimeRange] = useState(72);
  const [xrayData, setXrayData] = useState([]);
  const [flareData, setFlareData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crosshairT, setCrosshairT] = useState(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomStart, setZoomStart] = useState(null);
  const [customRange, setCustomRange] = useState(null);
  const [showXrsB, setShowXrsB] = useState(true);
  const [showXrsA, setShowXrsA] = useState(false);
  const [showFlares, setShowFlares] = useState(true);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [xrayRes, flareRes] = await Promise.allSettled([
          fetch(`${BASE}/sw_goes_xray.json?t=${Date.now()}`),
          fetch(`${BASE}/goes_flares.json?t=${Date.now()}`),
        ]);

        if (xrayRes.status === 'fulfilled' && xrayRes.value.ok) {
          const json = await xrayRes.value.json();
          setXrayData(parseXrayData(json));
        }

        if (flareRes.status === 'fulfilled' && flareRes.value.ok) {
          const json = await flareRes.value.json();
          setFlareData(parseFlareData(json));
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load X-ray data:', err);
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleZoomClick = useCallback((t) => {
    if (!zoomStart) {
      setZoomStart(t);
    } else {
      const t1 = Math.min(zoomStart, t);
      const t2 = Math.max(zoomStart, t);
      setCustomRange([t1, t2]);
      setZoomStart(null);
      setZoomMode(false);
    }
  }, [zoomStart]);

  const resetZoom = () => {
    setCustomRange(null);
    setZoomStart(null);
    setZoomMode(false);
  };

  const actualRange = customRange
    ? customRange
    : [Date.now() - timeRange * 3600000, Date.now()];

  // Find last M/X flare
  const lastMXFlare = [...flareData]
    .filter(f => {
      const cls = f.class_type || (f.peak_flux ? flareClass(f.peak_flux) : '');
      return cls === 'M' || cls === 'X';
    })
    .sort((a, b) => b.peak_time - a.peak_time)[0] || null;

  if (loading) {
    return (
      <div style={{ padding: 20, fontFamily: FONT, color: C.textDim, background: C.bg, height: '100%' }}>
        Loading X-ray flux data...
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
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Channel toggles */}
          <ToggleButton label="XRS-B" active={showXrsB} onClick={() => setShowXrsB(!showXrsB)} color={C.xrsB} />
          <ToggleButton label="XRS-A" active={showXrsA} onClick={() => setShowXrsA(!showXrsA)} color={C.xrsA} />
          <ToggleButton label="FLARES" active={showFlares} onClick={() => setShowFlares(!showFlares)} color={C.classM} />

          <div style={{ width: 1, height: 14, background: C.grid, margin: '0 2px' }} />

          {/* Time range */}
          {!customRange && TIME_RANGES.map(r => (
            <ToggleButton
              key={r.hours}
              label={r.label}
              active={timeRange === r.hours && !zoomMode}
              onClick={() => { setTimeRange(r.hours); resetZoom(); }}
              color="#44ddaa"
            />
          ))}

          {/* Zoom controls */}
          <ToggleButton
            label="Zoom"
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

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top: X-Ray Flux Plot — flex 6 */}
        <div style={{ flex: 6, display: 'flex', flexDirection: 'column', padding: '4px 10px 0', minHeight: 0 }}>
          <XRayPlot
            data={xrayData}
            flares={flareData}
            timeRange={actualRange}
            showXrsB={showXrsB}
            showXrsA={showXrsA}
            showFlares={showFlares}
            crosshairT={zoomMode ? null : crosshairT}
            onCrosshair={zoomMode ? handleZoomClick : setCrosshairT}
            zoomMode={zoomMode}
            zoomStart={zoomStart}
          />
        </div>

        {/* Bottom: Last M/X Flare Report — flex 4 */}
        <div style={{ flex: 4, padding: '4px 10px 6px', minHeight: 0, display: 'flex', gap: 6 }}>
          {/* Left: Flare data card */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <FlareCard flare={lastMXFlare} />
          </div>
          {/* Right: Zoomed flare plot */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <FlareZoomPlot data={xrayData} flare={lastMXFlare} />
          </div>
        </div>
      </div>
    </div>
  );
}
