/**
 * SpaceWeatherPanel — Space Weather tab content
 *
 * Two sub-tabs: L1 SOLAR WIND | EARLY DETECTION
 *
 * L1 Solar Wind plots (all toggleable, shared time axis):
 *   1. Bxyz + Bt  — Bx purple, By blue, Bz red/green, Bt yellow
 *   2. Phi GSM    — scatter, sector shading toggle, Parker spiral reference
 *   3. Speed      — blue line + ENLIL orange dashed overlay
 *   4. Density    — purple line
 *   5. Temperature — orange line, log scale
 *
 * Early Detection plots:
 *   1. EPAM Electrons — e38 blue, e175 cyan, log scale
 *   2. EPAM Protons   — multi-channel color coded, log scale
 *
 * Interactions:
 *   - Tap/drag crosshair: vertical line across all plots, value labels
 *   - Time range presets: 1H 6H 24H 3D 7D
 *   - Zoom: tap magnifying glass then drag to define range, double-tap to reset
 *
 * Annotations (auto-detected, vertical markers):
 *   - SSC candidate: density spike + speed jump
 *   - Sector boundary crossing: phi crosses Towards/Away threshold
 *   - Southward Bz onset: Bz < -5 nT sustained
 *   - Data gaps: hatched gray region
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

// ── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#06080f',
  plotBg:   '#04060d',
  grid:     'rgba(30,45,70,0.6)',
  zero:     'rgba(60,90,120,0.5)',
  text:     '#2a4a5a',
  textDim:  '#1a2a3a',
  border:   '#0d1525',
  now:      'rgba(255,255,255,0.35)',
  gap:      'rgba(30,30,30,0.85)',

  bz_neg:  '#ee5577',
  bz_pos:  '#44ddaa',
  bx:      '#9966cc',
  by:      '#4488ff',
  bt:      '#ffcc44',
  speed:   '#4488ff',
  enlil:   'rgba(255,140,40,0.7)',
  density: '#aa66ff',
  temp:    '#ff8844',
  phi:     '#44aaff',
  toward:  'rgba(255,80,80,0.08)',
  parker:  'rgba(100,200,255,0.4)',

  e38:   '#44aaff',
  e175:  '#44eeff',
  p47:   '#44ff88',
  p68:   '#88ff44',
  p115:  '#ffee44',
  p310:  '#ffaa44',
  p795:  '#ff6644',
  p1060: '#ff2244',

  annot_ssc:    'rgba(255,140,0,0.8)',
  annot_sb:     'rgba(200,200,200,0.6)',
  annot_bz5:    'rgba(238,85,119,0.7)',
  annot_bz10:   'rgba(200,30,60,0.8)',
  annot_hss:    'rgba(255,180,40,0.7)',
}

// ── Time range presets ────────────────────────────────────────────────────────
const PRESETS = [
  { label: '1H',  ms: 1  * 3600000 },
  { label: '6H',  ms: 6  * 3600000 },
  { label: '24H', ms: 24 * 3600000 },
  { label: '3D',  ms: 3  * 86400000 },
  { label: '7D',  ms: 7  * 86400000 },
]

// ── Parker spiral angle (Away sector, GSM phi degrees) ───────────────────────
function parkerAngle(speedKms) {
  const OMEGA = 2.86e-6  // rad/s solar rotation
  const R = 1.5e11       // m, 1 AU
  const v = (speedKms || 450) * 1000
  const phi_rad = Math.atan(OMEGA * R / v)
  const away = (360 - Math.degrees(phi_rad) + 360) % 360
  const toward = (away + 180) % 360
  return { away, toward }
}
Math.degrees = r => r * 180 / Math.PI

// ── Sector classification (Towards = 90–270°) ────────────────────────────────
function isToward(phi) {
  return phi >= 90 && phi < 270
}

// ── Data gap detection ────────────────────────────────────────────────────────
const GAP_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes

// ── Auto-annotations ─────────────────────────────────────────────────────────
function detectAnnotations(mag, plasma) {
  const annotations = []
  if (!plasma || plasma.length < 10) return annotations

  // SSC: density spike >2x 30-min mean AND speed jump >50 km/s in 30 min
  const WIN = 30 * 60000
  for (let i = 10; i < plasma.length; i++) {
    const t = plasma[i].time.getTime()
    const window = plasma.filter(p => p.time.getTime() >= t - WIN && p.time.getTime() < t)
    if (window.length < 5) continue
    const meanD = window.reduce((s, p) => s + (p.density || 0), 0) / window.length
    const speeds = window.map(p => p.speed).filter(Boolean)
    if (!speeds.length) continue
    const minV = Math.min(...speeds), maxV = Math.max(...speeds)
    const dNow = plasma[i].density
    if (dNow && dNow > meanD * 2.2 && maxV - minV > 50) {
      annotations.push({ time: plasma[i].time, type: 'ssc', label: 'SSC?' })
      i += 30  // skip ahead to avoid duplicate detections
    }
  }

  // Southward Bz onset: Bz < -5 sustained for 10 min
  if (mag && mag.length > 10) {
    const BZ_WIN = 10 * 60000
    let bzBelow5Start = null
    let bzBelow10Start = null
    for (const pt of mag) {
      const bz = pt.bz
      if (bz === null) { bzBelow5Start = null; bzBelow10Start = null; continue }
      if (bz < -5) {
        if (!bzBelow5Start) bzBelow5Start = pt.time.getTime()
        else if (pt.time.getTime() - bzBelow5Start >= BZ_WIN) {
          annotations.push({ time: new Date(bzBelow5Start), type: 'bz5', label: 'Bz −5' })
          bzBelow5Start = null
        }
      } else { bzBelow5Start = null }
      if (bz < -10) {
        if (!bzBelow10Start) bzBelow10Start = pt.time.getTime()
        else if (pt.time.getTime() - bzBelow10Start >= BZ_WIN) {
          annotations.push({ time: new Date(bzBelow10Start), type: 'bz10', label: 'Bz −10' })
          bzBelow10Start = null
        }
      } else { bzBelow10Start = null }
    }

    // Sector boundary crossings
    let prevSector = null
    for (const pt of mag) {
      if (pt.phi === null) continue
      const sector = isToward(pt.phi) ? 'toward' : 'away'
      if (prevSector && sector !== prevSector) {
        annotations.push({ time: pt.time, type: 'sb', label: 'SB' })
      }
      prevSector = sector
    }
  }

  return annotations.sort((a, b) => a.time - b.time)
}

// ── Single plot canvas ────────────────────────────────────────────────────────
function PlotCanvas({ data, series, yMin, yMax, logScale, timeRange, crosshairTime, onCrosshair,
                      annotations, phiMode, speedKms, showParker, showSector,
                      showLabels, yLabel, nowTime, zoomMode, thresholds, symmetric }) {
  const canvasRef = useRef(null)
  const dpr = window.devicePixelRatio || 1

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !data || data.length === 0) return
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    if (W === 0 || H === 0) return
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()

    const PAD_L = showLabels ? 36 : 8
    const PAD_R = 6
    const PAD_T = 4
    const PAD_B = showLabels ? 18 : 4
    const pW = W - PAD_L - PAD_R
    const pH = H - PAD_T - PAD_B

    const [tMin, tMax] = timeRange
    const spanMs = tMax - tMin

    // Auto-scale: compute yMin/yMax from visible data when null is passed
    let effectiveYMin = yMin
    let effectiveYMax = yMax
    if (yMin == null || yMax == null) {
      const visData = data.filter(p => p.time.getTime() >= tMin && p.time.getTime() <= tMax)
      let allVals = []
      for (const s of series) {
        if (!s || !s.key) continue
        const vals = visData.map(p => p[s.key]).filter(v =>
          v !== null && v !== undefined && !isNaN(v) && (logScale ? v > 0 : true)
        )
        allVals = allVals.concat(vals)
      }
      if (allVals.length >= 2) {
        const dataMin = Math.min(...allVals)
        const dataMax = Math.max(...allVals)
        if (logScale) {
          effectiveYMin = yMin ?? dataMin * 0.5
          effectiveYMax = yMax ?? dataMax * 2
        } else if (symmetric) {
          // Symmetric around zero — for Bz/Bx/By type plots
          const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax), 2) * 1.15
          effectiveYMin = yMin ?? -absMax
          effectiveYMax = yMax ??  absMax
        } else {
          const span = dataMax - dataMin || Math.abs(dataMax) || 1
          const pad = span * 0.12
          effectiveYMin = yMin ?? dataMin - pad
          effectiveYMax = yMax ?? dataMax + pad
          // Always include zero if data is all-positive
          if (effectiveYMin > 0 && dataMin >= 0) effectiveYMin = 0
        }
      } else {
        effectiveYMin = yMin ?? (logScale ? 1e-2 : -10)
        effectiveYMax = yMax ?? (logScale ? 1e4  :  10)
      }
    }
    const resolvedYMin = effectiveYMin
    const resolvedYMax = effectiveYMax

    function tx(t) { return PAD_L + ((t - tMin) / spanMs) * pW }
    function vy(v) {
      if (v === null || v === undefined || isNaN(v)) return null
      let y
      if (logScale) {
        if (v <= 0) return null
        const logMin = Math.log10(Math.max(resolvedYMin, 1e-10))
        const logMax = Math.log10(Math.max(resolvedYMax, 1e-9))
        y = PAD_T + pH - ((Math.log10(v) - logMin) / (logMax - logMin)) * pH
      } else {
        y = PAD_T + pH - ((v - resolvedYMin) / (resolvedYMax - resolvedYMin)) * pH
      }
      // Clamp to plot area so no dot ever escapes the canvas
      return Math.max(PAD_T, Math.min(PAD_T + pH, y))
    }

    // Background
    ctx.fillStyle = C.plotBg
    ctx.fillRect(0, 0, W, H)

    // Phi sector shading
    if (phiMode && showSector) {
      let inToward = false, startX = PAD_L
      const pts = data.filter(p => p.phi !== null && p.time >= tMin && p.time <= tMax)
      for (let i = 0; i < pts.length; i++) {
        const toward = isToward(pts[i].phi)
        const x = tx(pts[i].time.getTime())
        if (i === 0) { inToward = toward; startX = x }
        if (toward !== inToward || i === pts.length - 1) {
          if (inToward) {
            ctx.fillStyle = C.toward
            ctx.fillRect(startX, PAD_T, Math.max(0, x - startX), pH)
          }
          inToward = toward; startX = x
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5
    const gridCount = 4
    for (let i = 0; i <= gridCount; i++) {
      const y = PAD_T + (i / gridCount) * pH
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke()
    }

    // Zero line
    if (!logScale && resolvedYMin < 0 && resolvedYMax > 0) {
      const y0 = vy(0)
      ctx.strokeStyle = C.zero; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD_L, y0); ctx.lineTo(W - PAD_R, y0); ctx.stroke()
    }

    // Threshold lines (e.g. B/C/M/X for X-ray, S1/S2/S3 for protons)
    if (thresholds && thresholds.length > 0) {
      ctx.setLineDash([6, 3])
      for (const th of thresholds) {
        const y = vy(th.value)
        if (y === null) continue
        ctx.strokeStyle = th.color || 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke()
        if (th.label) {
          ctx.fillStyle = th.color || 'rgba(255,255,255,0.5)'
          ctx.font = `7px ${FONT}`; ctx.textAlign = 'left'
          ctx.fillText(th.label, PAD_L + 2, y - 2)
        }
      }
      ctx.setLineDash([])
    }

    // Parker spiral reference lines
    if (phiMode && showParker && speedKms) {
      const { away, toward } = parkerAngle(speedKms)
      ctx.strokeStyle = C.parker; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      for (const ang of [away, toward]) {
        const y = vy(ang)
        if (y !== null) {
          ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke()
          ctx.fillStyle = C.parker
          ctx.font = `7px ${FONT}`
          ctx.fillText(ang === away ? `Parker Away` : `Parker Toward`, PAD_L + 2, y - 2)
        }
      }
      ctx.setLineDash([])
    }

    // Annotations
    for (const ann of (annotations || [])) {
      const t = ann.time.getTime()
      if (t < tMin || t > tMax) continue
      const x = tx(t)
      const color = ann.type === 'ssc' ? C.annot_ssc
        : ann.type === 'sb' ? C.annot_sb
        : ann.type === 'bz10' ? C.annot_bz10
        : C.annot_bz5
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.setLineDash(ann.type === 'sb' ? [2, 3] : [4, 3])
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + pH); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = color; ctx.font = `7px ${FONT}`
      ctx.fillText(ann.label, x + 2, PAD_T + 8)
    }

    // Data gaps
    const visData = data.filter(p => p.time.getTime() >= tMin && p.time.getTime() <= tMax)
    for (let i = 1; i < visData.length; i++) {
      const gap = visData[i].time.getTime() - visData[i-1].time.getTime()
      if (gap > GAP_THRESHOLD_MS) {
        const x1 = tx(visData[i-1].time.getTime())
        const x2 = tx(visData[i].time.getTime())
        ctx.fillStyle = C.gap
        ctx.fillRect(x1, PAD_T, x2 - x1, pH)
        // Hatching
        ctx.strokeStyle = 'rgba(50,50,50,0.6)'; ctx.lineWidth = 1
        for (let hx = x1; hx < x2; hx += 6) {
          ctx.beginPath(); ctx.moveTo(hx, PAD_T); ctx.lineTo(hx + pH, PAD_T + pH); ctx.stroke()
        }
      }
    }

    // Series
    for (const s of series) {
      const pts = data.filter(p => p.time.getTime() >= tMin && p.time.getTime() <= tMax && p[s.key] !== null)
      if (pts.length === 0) continue

      if (s.scatter || phiMode) {
        // Scatter dots for phi
        for (const pt of pts) {
          const x = tx(pt.time.getTime())
          const y = vy(pt[s.key])
          if (y === null) continue
          ctx.fillStyle = s.color
          ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
        }
      } else {
        // Line with gap detection and optional per-point color function
        ctx.lineWidth = s.width || 1.2
        ctx.setLineDash(s.dash || [])
        let drawing = false
        let prevT = null
        let curColor = null
        ctx.beginPath()

        for (const pt of pts) {
          const x = tx(pt.time.getTime())
          const v = pt[s.key]
          const y = vy(v)
          if (y === null) { drawing = false; continue }

          // Gap detection
          if (prevT && (pt.time.getTime() - prevT) > GAP_THRESHOLD_MS) {
            ctx.stroke(); ctx.beginPath(); drawing = false
          }

          const color = s.colorFn ? s.colorFn(v) : s.color

          if (!drawing) {
            ctx.strokeStyle = color
            ctx.beginPath()
            ctx.moveTo(x, y)
            drawing = true
            curColor = color
          } else if (color !== curColor) {
            // Color changed — stroke current segment, start new one from prev point
            ctx.lineTo(x, y)
            ctx.stroke()
            ctx.strokeStyle = color
            ctx.beginPath()
            ctx.moveTo(x, y)
            curColor = color
          } else {
            ctx.lineTo(x, y)
          }
          prevT = pt.time.getTime()
        }
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // NOW line
    if (nowTime >= tMin && nowTime <= tMax) {
      const x = tx(nowTime)
      ctx.strokeStyle = C.now; ctx.lineWidth = 1.5; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + pH); ctx.stroke()
      ctx.fillStyle = C.now; ctx.font = `7px ${FONT}`
      ctx.fillText('NOW', x + 2, PAD_T + 8)
    }

    // Crosshair
    if (crosshairTime !== null && crosshairTime >= tMin && crosshairTime <= tMax) {
      const x = tx(crosshairTime)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + pH); ctx.stroke()
      ctx.setLineDash([])
      // Value labels
      for (const s of series) {
        const nearest = data.reduce((best, p) => {
          if (p[s.key] === null) return best
          return Math.abs(p.time.getTime() - crosshairTime) < Math.abs((best?.time?.getTime() || Infinity) - crosshairTime) ? p : best
        }, null)
        if (!nearest || nearest[s.key] === null) continue
        const y = vy(nearest[s.key])
        if (y === null) continue
        const val = logScale ? nearest[s.key].toExponential(1) : nearest[s.key].toFixed(1)
        const label = `${val}`
        ctx.fillStyle = 'rgba(6,8,15,0.8)'
        const tw = ctx.measureText(label).width
        const lx = Math.min(x + 3, W - PAD_R - tw - 2)
        ctx.fillRect(lx - 1, y - 8, tw + 4, 11)
        ctx.fillStyle = s.color || '#fff'
        ctx.font = `8px ${FONT}`
        ctx.fillText(label, lx + 1, y)
        // Highlight dot
        ctx.fillStyle = s.color || '#fff'
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
      }
    }

    // Y-axis labels
    if (showLabels) {
      ctx.fillStyle = C.text; ctx.font = `7px ${FONT}`
      const steps = logScale ? [resolvedYMin, Math.sqrt(resolvedYMin * resolvedYMax), resolvedYMax] : [resolvedYMax, (resolvedYMin + resolvedYMax) / 2, resolvedYMin]
      for (const v of steps) {
        const y = vy(v)
        if (y === null) continue
        const label = logScale ? v.toExponential(0) : Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v.toFixed(v % 1 === 0 ? 0 : 1)
        ctx.fillText(label, 1, y + 3)
      }
      if (yLabel) {
        ctx.save(); ctx.translate(9, PAD_T + pH / 2); ctx.rotate(-Math.PI / 2)
        ctx.fillStyle = C.text; ctx.font = `7px ${FONT}`
        ctx.textAlign = 'center'; ctx.fillText(yLabel, 0, 0)
        ctx.restore()
      }
    }

    // X-axis time labels
    if (showLabels) {
      ctx.fillStyle = C.text; ctx.font = `7px ${FONT}`; ctx.textAlign = 'center'
      const spanH = spanMs / 3600000
      const tickInterval = spanH <= 2 ? 30 : spanH <= 12 ? 60 : spanH <= 48 ? 360 : 1440
      const tickMs = tickInterval * 60000
      const firstTick = Math.ceil(tMin / tickMs) * tickMs
      for (let t = firstTick; t <= tMax; t += tickMs) {
        const x = tx(t)
        const d = new Date(t)
        const label = spanH <= 24
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
          : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
        ctx.fillText(label, x, H - 3)
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(x, PAD_T + pH); ctx.lineTo(x, PAD_T + pH + 3); ctx.stroke()
      }
    }

  }, [data, series, yMin, yMax, logScale, timeRange, crosshairTime, annotations,
      phiMode, speedKms, showParker, showSector, showLabels, nowTime, thresholds, symmetric])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])

  function handlePointer(e) {
    if (!onCrosshair) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const PAD_L = showLabels ? 36 : 8
    const PAD_R = 6
    const pW = rect.width - PAD_L - PAD_R
    const x = e.clientX - rect.left - PAD_L
    const frac = Math.max(0, Math.min(1, x / pW))
    const [tMin, tMax] = timeRange
    const t = tMin + frac * (tMax - tMin)
    // In zoom mode only fire on tap (pointerDown), not on move
    if (zoomMode && e.type !== 'pointerdown') return
    onCrosshair(t)
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={zoomMode ? undefined : handlePointer}
      onPointerLeave={() => !zoomMode && onCrosshair && onCrosshair(null)}
      onPointerDown={handlePointer}
      style={{ width: '100%', height: '100%', display: 'block',
               cursor: zoomMode ? 'col-resize' : 'crosshair', overflow: 'hidden' }}
    />
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function Toggle({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
      border: `1px solid ${active ? (color || '#44ddaa') : '#1a2a3a'}`,
      color: active ? (color || '#44ddaa') : '#2a4a5a',
      padding: '2px 7px', fontSize: 8, fontFamily: FONT,
      letterSpacing: 0.5, cursor: 'pointer', borderRadius: 2,
      transition: 'all 0.15s',
    }}>{label}</button>
  )
}

// ── Session-persistent state ──────────────────────────────────────────────────
function usePersist(key, def) {
  const [val, setVal] = useState(() => {
    try {
      const s = sessionStorage.getItem('nw_sw_' + key)
      return s !== null ? JSON.parse(s) : def
    } catch { return def }
  })
  const set = useCallback((v) => {
    setVal(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      try { sessionStorage.setItem('nw_sw_' + key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])
  return [val, set]
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpaceWeatherPanel({ mag, plasma, epam, stereo, goes, spaceWeather }) {
  const [subTab,      setSubTab]      = usePersist('subTab',      'l1')
  const [presetMs,    setPresetMs]    = usePersist('presetMs',    24 * 3600000)
  const [goesPresetMs,setGoesPresetMs]= usePersist('goesPresetMs', 3 * 86400000)
  const [zoomRange,   setZoomRange]   = usePersist('zoomRange',   null)
  const [crosshairT,  setCrosshairT]  = useState(null)

  // Zoom mode — two-tap to define range
  const [zoomMode,    setZoomMode]    = useState(false)
  const [zoomStep,    setZoomStep]    = useState(0)  // 0=waiting first tap, 1=waiting second tap
  const zoomStartRef  = useRef(null)

  // Plot visibility toggles — L1
  const [showBxyz,    setShowBxyz]    = usePersist('showBxyz',    true)
  const [showBx,      setShowBx]      = usePersist('showBx',      true)
  const [showBy,      setShowBy]      = usePersist('showBy',      true)
  const [showBz,      setShowBz]      = usePersist('showBz',      true)
  const [showBt,      setShowBt]      = usePersist('showBt',      true)
  const [showPhi,     setShowPhi]     = usePersist('showPhi',      true)
  const [showSector,  setShowSector]  = usePersist('showSector',  true)
  const [showParker,  setShowParker]  = usePersist('showParker',  true)
  const [showSpeed,   setShowSpeed]   = usePersist('showSpeed',   true)
  const [showDensity, setShowDensity] = usePersist('showDensity', true)
  const [showTemp,    setShowTemp]    = usePersist('showTemp',     true)

  // Plot visibility toggles — EPAM
  const [showElec,    setShowElec]    = usePersist('showElec',    true)
  const [showProt,    setShowProt]    = usePersist('showProt',     true)
  const [showStereo,  setShowStereo]  = usePersist('showStereo',  true)

  // Plot visibility toggles — GOES
  // GOES magnetometer component toggles
  const [showGoesHp, setShowGoesHp] = usePersist('showGoesHp', true)
  const [showGoesHe, setShowGoesHe] = usePersist('showGoesHe', false)
  const [showGoesHn, setShowGoesHn] = usePersist('showGoesHn', false)
  const [showGoesEast, setShowGoesEast] = usePersist('showGoesEast', true)
  const [showGoesWest, setShowGoesWest] = usePersist('showGoesWest', true)

  // Annotations toggle (SSC, SB markers) — off by default
  const [showAnnots,  setShowAnnots]  = usePersist('showAnnots',  false)

  const now = Date.now()
  const activePresetMs = subTab === 'goes' ? goesPresetMs : presetMs
  const timeRange = useMemo(() => {
    if (zoomRange) return zoomRange
    return [now - activePresetMs, now]
  }, [activePresetMs, zoomRange, now])

  const annotations = useMemo(() => detectAnnotations(mag, plasma), [mag, plasma])

  const speedKms = spaceWeather?.speed_kms || 450

  // Bz dynamic range
  const bzRange = useMemo(() => {
    if (!mag || mag.length === 0) return [-20, 20]
    const vals = mag.map(p => p.bz).filter(v => v !== null)
    const mx = Math.max(10, ...vals.map(Math.abs)) * 1.1
    return [-mx, mx]
  }, [mag])

  // Speed range
  const speedRange = useMemo(() => {
    if (!plasma || plasma.length === 0) return [250, 800]
    const vals = plasma.map(p => p.speed).filter(Boolean)
    if (!vals.length) return [250, 800]
    return [Math.max(200, Math.min(...vals) * 0.9), Math.max(600, Math.max(...vals) * 1.1)]
  }, [plasma])

  // Density range
  const densityRange = useMemo(() => {
    if (!plasma || plasma.length === 0) return [0, 50]
    const vals = plasma.map(p => p.density).filter(Boolean)
    if (!vals.length) return [0, 50]
    return [0, Math.max(20, Math.max(...vals) * 1.1)]
  }, [plasma])

  // Zoom-mode tap handler — passed to all PlotCanvas via commonProps
  const handleZoomTap = useCallback((t) => {
    if (!zoomMode) return
    if (zoomStartRef.current === null) {
      zoomStartRef.current = t
      setZoomStep(1)
    } else {
      const a = zoomStartRef.current, b = t
      setZoomRange([Math.min(a, b), Math.max(a, b)])
      zoomStartRef.current = null
      setZoomStep(0)
      setZoomMode(false)
    }
  }, [zoomMode, setZoomRange])

  const commonProps = {
    timeRange,
    crosshairTime: zoomMode ? null : crosshairT,
    onCrosshair:   zoomMode ? handleZoomTap : setCrosshairT,
    annotations:   showAnnots ? annotations : [],
    nowTime: now, speedKms,
    showLabels: true,   // y-axis always visible
    zoomMode,
  }

  // plot height now handled by flex:1 on container

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>

      {/* Sub-tab selector */}
      <div style={{ display: 'flex', gap: 3, padding: '4px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {[['l1', 'L1 SOLAR WIND'], ['epam', 'EARLY DETECTION'], ['goes', 'GOES']].map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)} style={{
            flex: 1, height: 28, background: subTab === key ? '#0d1a2a' : '#060810',
            border: `1px solid ${subTab === key ? '#44ddaa' : '#1a2a3a'}`,
            color: subTab === key ? '#44ddaa' : '#2a4a5a',
            fontSize: 9, fontFamily: FONT, letterSpacing: 0.5,
            cursor: 'pointer', borderRadius: 2, position: 'relative',
          }}>
            {subTab === key && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(68,221,170,0.5)' }} />}
            {label}
          </button>
        ))}
      </div>

      {/* Time range presets */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 8px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: C.textDim, fontSize: 8, letterSpacing: 1, marginRight: 4 }}>RANGE</span>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => {
            if (subTab === 'goes') setGoesPresetMs(p.ms); else setPresetMs(p.ms)
            setZoomRange(null)
          }} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT, letterSpacing: 0.5,
            background: !zoomRange && activePresetMs === p.ms ? '#0d1a2a' : 'transparent',
            border: `1px solid ${!zoomRange && activePresetMs === p.ms ? '#44ddaa' : '#1a2a3a'}`,
            color: !zoomRange && activePresetMs === p.ms ? '#44ddaa' : '#2a4a5a',
            cursor: 'pointer', borderRadius: 2,
          }}>{p.label}</button>
        ))}
        {zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{
            padding: '1px 7px', fontSize: 8, fontFamily: FONT,
            background: '#1a0a00', border: '1px solid #ff8800', color: '#ff8800',
            cursor: 'pointer', borderRadius: 2, marginLeft: 4,
          }}>RESET ZOOM</button>
        )}
      </div>

      {/* Zoom mode instruction */}
      {zoomMode && (
        <div style={{ padding: '3px 10px', background: '#1a0d00', borderBottom: `1px solid #ff8800`,
          color: '#ff8800', fontSize: 8, letterSpacing: 0.5, flexShrink: 0, textAlign: 'center' }}>
          {zoomStep === 0
            ? 'TAP FIRST POINT ON ANY PLOT'
            : 'TAP SECOND POINT TO SET ZOOM RANGE'}
        </div>
      )}

      {/* Plot area — flex column, each plot gets equal share of space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {subTab === 'l1' && (<>

          {/* Bxyz + Bt */}
          {showBxyz && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 3, padding: '3px 8px 2px', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>MAGNETIC FIELD (nT)</span>
                <Toggle label="Bx" active={showBx} color={C.bx} onClick={() => setShowBx(v => !v)} />
                <Toggle label="By" active={showBy} color={C.by} onClick={() => setShowBy(v => !v)} />
                <Toggle label="Bz" active={showBz} color={C.bz_pos} onClick={() => setShowBz(v => !v)} />
                <Toggle label="Bt" active={showBt} color={C.bt}  onClick={() => setShowBt(v => !v)} />
              </div>
              <PlotCanvas
                data={mag || []}
                series={[
                  showBx && { key: 'bx', color: C.bx, width: 1.0 },
                  showBy && { key: 'by', color: C.by, width: 1.0,
                    colorFn: v => v < 0 ? '#ff8800' : C.by },
                  showBt && { key: 'bt', color: C.bt, width: 1.0, dash: [4, 2] },
                  showBz && { key: 'bz', color: C.bz_pos, width: 1.6,
                    colorFn: v => v < 0 ? C.bz_neg : C.bz_pos },
                ].filter(Boolean)}
                yMin={null} yMax={null} symmetric={true}
                {...commonProps}
              />
            </div>
          )}

          {/* Phi */}
          {showPhi && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 3, padding: '3px 8px 2px', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>IMF PHI GSM (°)</span>
                <Toggle label="SECTOR" active={showSector} color="#ff5566" onClick={() => setShowSector(v => !v)} />
                <Toggle label="PARKER" active={showParker} color={C.parker} onClick={() => setShowParker(v => !v)} />
              </div>
              <PlotCanvas
                data={mag || []}
                series={[{ key: 'phi', color: C.phi, scatter: true }]}
                yMin={-10} yMax={370}
                phiMode={true}
                showSector={showSector}
                showParker={showParker}
                {...commonProps}
              />
            </div>
          )}

          {/* Speed */}
          {showSpeed && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>SOLAR WIND SPEED (km/s)</span>
              </div>
              <PlotCanvas
                data={plasma || []}
                series={[{ key: 'speed', color: C.speed, width: 1.3 }]}
                yMin={null} yMax={null}
                {...commonProps}
              />
            </div>
          )}

          {/* Density */}
          {showDensity && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>PROTON DENSITY (n/cc)</span>
              </div>
              <PlotCanvas
                data={plasma || []}
                series={[{ key: 'density', color: C.density, width: 1.3 }]}
                yMin={null} yMax={null}
                {...commonProps}
              />
            </div>
          )}

          {/* Temperature */}
          {showTemp && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>TEMPERATURE (K)</span>
              </div>
              <PlotCanvas
                data={plasma || []}
                series={[{ key: 'temperature', color: C.temp, width: 1.3 }]}
                yMin={null} yMax={null} logScale={true}
                {...commonProps}
              />
            </div>
          )}

          {/* Plot toggle row */}
          <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, width: '100%', marginBottom: 2 }}>SHOW PLOTS</span>
            <Toggle label="B FIELD" active={showBxyz} onClick={() => setShowBxyz(v => !v)} />
            <Toggle label="PHI"     active={showPhi}  onClick={() => setShowPhi(v => !v)} />
            <Toggle label="SPEED"   active={showSpeed} onClick={() => setShowSpeed(v => !v)} />
            <Toggle label="DENSITY" active={showDensity} onClick={() => setShowDensity(v => !v)} />
            <Toggle label="TEMP"    active={showTemp}  onClick={() => setShowTemp(v => !v)} />
            <div style={{ flex: 1 }} />
            <Toggle label="ZOOM"  active={zoomMode}   color="#ffaa44" onClick={() => { setZoomMode(v => !v); zoomStartRef.current = null; setZoomStep(0) }} />
            <Toggle label="ANNOTS" active={showAnnots} onClick={() => setShowAnnots(v => !v)} />
          </div>

        </>)}

        {subTab === 'epam' && (<>

          {/* EPAM banner */}
          <div style={{ padding: '4px 10px', borderBottom: `1px solid ${C.border}`, color: '#2a4a5a', fontSize: 8, letterSpacing: 0.5, flexShrink: 0 }}>
            ACE EPAM · Energetic Particle Data · ~2 days · 5-min averaged
            {(!epam || epam.length === 0) && <span style={{ color: '#ff5544', marginLeft: 8 }}>NO DATA</span>}
          </div>

          {/* Electrons */}
          {showElec && epam && epam.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>ELECTRONS (cm⁻² s⁻¹ sr⁻¹ MeV⁻¹)</span>
                <span style={{ color: C.e38,  fontSize: 7 }}>■ 38–53 keV</span>
                <span style={{ color: C.e175, fontSize: 7, marginLeft: 4 }}>■ 175–315 keV</span>
              </div>
              <PlotCanvas
                data={epam}
                series={[
                  { key: 'e38',  color: C.e38,  width: 1.3 },
                  { key: 'e175', color: C.e175, width: 1.3 },
                ]}
                yMin={1e1} yMax={1e6} logScale={true}
                {...commonProps} annotations={[]}
              />
            </div>
          )}

          {/* Protons */}
          {showProt && epam && epam.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, width: '100%' }}>PROTONS (cm⁻² s⁻¹ sr⁻¹ MeV⁻¹)</span>
                {[['p47','47–68'],['p68','68–115'],['p115','115–195'],['p310','310–580'],['p795','795–1193'],['p1060','1060–1900']].map(([k,l]) => (
                  <span key={k} style={{ color: C[k], fontSize: 6 }}>■ {l}</span>
                ))}
              </div>
              <PlotCanvas
                data={epam}
                series={[
                  { key: 'p47',   color: C.p47,   width: 1.0 },
                  { key: 'p68',   color: C.p68,   width: 1.0 },
                  { key: 'p115',  color: C.p115,  width: 1.0 },
                  { key: 'p310',  color: C.p310,  width: 1.1 },
                  { key: 'p795',  color: C.p795,  width: 1.2 },
                  { key: 'p1060', color: C.p1060, width: 1.3 },
                ]}
                yMin={1e1} yMax={1e6} logScale={true}
                {...commonProps} annotations={[]}
              />
            </div>
          )}

          {/* STEREO-A upstream preview */}
          {showStereo && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>STEREO-A UPSTREAM · Bn (RTN ecliptic-north)</span>
                {stereo && stereo.length > 0
                  ? <span style={{ color: '#2a4a5a', fontSize: 6, marginLeft: 8 }}>{stereo.length} PTS</span>
                  : <span style={{ color: '#ff5544', fontSize: 6, marginLeft: 8 }}>NO DATA YET — ACCUMULATING</span>
                }
              </div>
              {stereo && stereo.length > 0
                ? <PlotCanvas
                    data={stereo}
                    series={[
                      { key: 'bn', color: C.bz_pos, width: 1.6,
                        colorFn: v => v < 0 ? C.bz_neg : C.bz_pos },
                      { key: 'bt_tot', color: C.bt, width: 1.0, dash: [3, 2] },
                    ]}
                    yMin={null} yMax={null}
                    {...commonProps} annotations={[]}
                  />
                : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#1a2a3a', fontSize: 8, letterSpacing: 1 }}>
                      PIPELINE WILL POPULATE ON NEXT RUN
                    </span>
                  </div>
              }
            </div>
          )}

          {showStereo && stereo && stereo.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>STEREO-A UPSTREAM · Speed &amp; Density</span>
              </div>
              <PlotCanvas
                data={stereo}
                series={[
                  { key: 'speed',   color: C.speed,   width: 1.3 },
                  { key: 'density', color: C.density, width: 1.3 },
                ]}
                yMin={null} yMax={null}
                {...commonProps} annotations={[]}
              />
            </div>
          )}

          {/* EPAM toggles */}
          <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, width: '100%', marginBottom: 2 }}>SHOW PLOTS</span>
            <Toggle label="ELECTRONS" active={showElec}   color={C.e38}    onClick={() => setShowElec(v => !v)} />
            <Toggle label="PROTONS"   active={showProt}   color={C.p310}   onClick={() => setShowProt(v => !v)} />
            <Toggle label="STEREO-A"  active={showStereo} color="#cc88ff"  onClick={() => setShowStereo(v => !v)} />
            <div style={{ flex: 1 }} />
            <Toggle label="ZOOM"   active={zoomMode}   color="#ffaa44" onClick={() => { setZoomMode(v => !v); zoomStartRef.current = null; setZoomStep(0) }} />
            <Toggle label="ANNOTS" active={showAnnots} onClick={() => setShowAnnots(v => !v)} />
          </div>

        </>)}

        {subTab === 'goes' && (<>

          {/* GOES Hp — parallel to Earth spin axis, key storm indicator */}
          {showGoesHp && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>Hp — PERP TO ORBITAL PLANE (nT)</span>
                {showGoesEast && <span style={{ color: '#ee5577', fontSize: 6 }}>■ EAST</span>}
                {showGoesWest && <span style={{ color: '#4488ff', fontSize: 6 }}>■ WEST</span>}
              </div>
              {goes && goes.length > 0
                ? <PlotCanvas
                    data={goes}
                    series={[
                      showGoesEast && { key: 'e_hp', color: '#ee5577', width: 1.4 },
                      showGoesWest && { key: 'w_hp', color: '#4488ff', width: 1.2 },
                    ].filter(Boolean)}
                    yMin={null} yMax={null}
                    {...commonProps} annotations={[]}
                  />
                : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ color: '#1a2a3a', fontSize: 8 }}>PIPELINE POPULATES ON NEXT RUN</span>
                  </div>
              }
            </div>
          )}

          {/* GOES He — earthward component, substorm dipolarization */}
          {showGoesHe && goes && goes.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>He — EARTHWARD (nT)</span>
                {showGoesEast && <span style={{ color: '#ff8899', fontSize: 6 }}>■ EAST</span>}
                {showGoesWest && <span style={{ color: '#44aaff', fontSize: 6 }}>■ WEST</span>}
              </div>
              <PlotCanvas
                data={goes}
                series={[
                  showGoesEast && { key: 'e_he', color: '#ff8899', width: 1.3 },
                  showGoesWest && { key: 'w_he', color: '#44aaff', width: 1.1 },
                ].filter(Boolean)}
                yMin={null} yMax={null}
                {...commonProps} annotations={[]}
              />
            </div>
          )}

          {/* GOES Hn — eastward component */}
          {showGoesHn && goes && goes.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '3px 8px 2px', flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>Hn — EASTWARD (nT)</span>
                {showGoesEast && <span style={{ color: '#ff4466', fontSize: 6 }}>■ EAST</span>}
                {showGoesWest && <span style={{ color: '#66aaff', fontSize: 6 }}>■ WEST</span>}
              </div>
              <PlotCanvas
                data={goes}
                series={[
                  showGoesEast && { key: 'e_hn', color: '#ff4466', width: 1.2 },
                  showGoesWest && { key: 'w_hn', color: '#66aaff', width: 1.0 },
                ].filter(Boolean)}
                yMin={null} yMax={null}
                {...commonProps} annotations={[]}
              />
            </div>
          )}

          {/* GOES toggle row */}
          <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, width: '100%', marginBottom: 2 }}>COMPONENTS</span>
            <Toggle label="Hp"   active={showGoesHp}   onClick={() => setShowGoesHp(v => !v)}   color="#ee5577" />
            <Toggle label="He"   active={showGoesHe}   onClick={() => setShowGoesHe(v => !v)}   color="#ff8899" />
            <Toggle label="Hn"   active={showGoesHn}   onClick={() => setShowGoesHn(v => !v)}   color="#ff4466" />
            <Toggle label="EAST" active={showGoesEast} onClick={() => setShowGoesEast(v => !v)} color="#ee5577" />
            <Toggle label="WEST" active={showGoesWest} onClick={() => setShowGoesWest(v => !v)} color="#4488ff" />
            <div style={{ flex: 1 }} />
            <Toggle label="ZOOM"   active={zoomMode}   color="#ffaa44" onClick={() => { setZoomMode(v => !v); zoomStartRef.current = null; setZoomStep(0) }} />
            <Toggle label="ANNOTS" active={showAnnots} onClick={() => setShowAnnots(v => !v)} />
          </div>

        </>)}
      </div>
    </div>
  )
}