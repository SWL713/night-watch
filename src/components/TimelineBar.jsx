import { useEffect, useRef } from 'react'

const FONT   = 'DejaVu Sans Mono, Consolas, monospace'
const NY_LAT = 40.7128
const NY_LON = -74.0060

// ── Sun times ─────────────────────────────────────────────────────────────────
function sunTimes(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff  = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start
  const doy   = Math.floor(diff / 86400000)
  const B     = (Math.PI * 2 / 365) * (doy - 81)
  const eot   = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
  const decl  = Math.asin(Math.sin(Math.PI * 2 / 365 * (doy - 81)) * Math.sin(23.45 * Math.PI / 180))
  const latR  = NY_LAT * Math.PI / 180
  let cosHA   = (Math.sin(-0.833 * Math.PI / 180) - Math.sin(latR) * Math.sin(decl)) /
                (Math.cos(latR) * Math.cos(decl))
  cosHA       = Math.max(-1, Math.min(1, cosHA))
  const ha    = Math.acos(cosHA) * 180 / Math.PI
  const noonMin = 720 - 4 * NY_LON - eot
  const base    = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    rise: new Date(base + (noonMin - ha * 4) * 60000),
    set:  new Date(base + (noonMin + ha * 4) * 60000),
  }
}

// ── Legend strip ──────────────────────────────────────────────────────────────
function LegendStrip() {
  const items = [
    { color: '#ffdd44', label: 'Sun' },
    { color: '#aabbcc', label: 'Moon' },
    { color: '#ee5577', label: '−Bz' },
    { color: '#44ddaa', label: '+Bz' },
    { color: '#4488ff', label: 'V (km/s)' },
    { color: '#bb66ff', label: 'n (n/cc)' },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '3px 8px', background: '#04060d',
      borderTop: '1px solid #0d1225', flexWrap: 'wrap',
    }}>
      {items.map(({ color, label }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            display: 'inline-block', width: 20, height: 2.5,
            background: color, borderRadius: 1, flexShrink: 0,
          }} />
          <span style={{ color: '#667788', fontSize: 9, fontFamily: FONT, whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </span>
      ))}
    </div>
  )
}

// ── Linear regression slope helper ────────────────────────────────────────────
function slope(points, getX, getY) {
  const n = points.length
  if (n < 5) return 0
  const sx  = points.reduce((a, p) => a + getX(p), 0)
  const sy  = points.reduce((a, p) => a + getY(p), 0)
  const sxy = points.reduce((a, p) => a + getX(p) * getY(p), 0)
  const sxx = points.reduce((a, p) => a + getX(p) * getX(p), 0)
  return (n * sxy - sx * sy) / (n * sxx - sx * sx) || 0
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TimelineBar({ spaceWeather, moonData, selectedHour, onHourSelect, bzTrace, plasmaTrace, helpMode, onHelpTap }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr  = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const cW = rect.width, cH = rect.height

    // Hard clip — nothing can render outside canvas bounds
    ctx.beginPath()
    ctx.rect(0, 0, cW, cH)
    ctx.clip()

    ctx.clearRect(0, 0, cW, cH)

    const now    = new Date()
    const tStart = new Date(now.getTime() - 3600000)        // -1hr Earth time
    const tEnd   = new Date(now.getTime() + 8 * 3600000)   // +8hr Earth time
    const spanMs = tEnd - tStart
    function tx(t) { return ((t - tStart) / spanMs) * cW }

    const PAD_T = 16, PAD_B = 16
    const pH = cH - PAD_T - PAD_B  // FULL height — Kp bars overlay, don't compress

    // Transit lag: how long solar wind takes from L1 to Earth
    const lagMs  = Math.min((1.5e6 / (spaceWeather.speed_kms || 450)) * 1000, 5400000)
    const lagEnd = new Date(now.getTime() + lagMs)  // when the latest L1 reading arrives at Earth

    // ── 1. BACKGROUND ────────────────────────────────────────────────────────
    ctx.fillStyle = '#04060d'
    ctx.fillRect(0, 0, cW, cH)

    // ── 2. DAYLIGHT SHADING ───────────────────────────────────────────────────
    const sun0  = sunTimes(new Date(now))
    const sun1  = sunTimes(new Date(now.getTime() + 86400000))
    const TAPER = 45 * 60000

    function dayFrac(t) {
      const tm = t.getTime()
      for (const { rise, set } of [sun0, sun1]) {
        if (!rise || !set) continue
        const dawnS = rise.getTime() - TAPER, dawnE = rise.getTime() + TAPER
        const duskS = set.getTime()  - TAPER, duskE = set.getTime()  + TAPER
        if (tm >= dawnE && tm <= duskS) return 1.0
        if (tm >= dawnS && tm <  dawnE) return (tm - dawnS) / (2 * TAPER)
        if (tm >  duskS && tm <= duskE) return 1.0 - (tm - duskS) / (2 * TAPER)
      }
      return 0.0
    }

    const SLICES = 300
    for (let i = 0; i < SLICES; i++) {
      const t0 = new Date(tStart.getTime() + (i / SLICES) * spanMs)
      const t1 = new Date(tStart.getTime() + ((i + 1) / SLICES) * spanMs)
      const d  = dayFrac(t0)
      if (d <= 0.02) continue
      ctx.fillStyle = `rgba(255,210,60,${0.18 * d})`
      ctx.fillRect(tx(t0), PAD_T, Math.ceil(tx(t1) - tx(t0)) + 1, pH)
    }

    // ── 3. MOON SHADING (top 28%) ─────────────────────────────────────────────
    const moonRise  = spaceWeather.moon_rise ? new Date(spaceWeather.moon_rise) : null
    const moonSet   = spaceWeather.moon_set  ? new Date(spaceWeather.moon_set)  : null
    const moonIllum = spaceWeather.moon_illumination || moonData?.illumination || 0
    const moonAlpha = Math.max(0.08, moonIllum * 0.45)
    const moonH     = pH * 0.28
    const MOON_TAPER = 30 * 60000

    function moonFrac(t) {
      const tm = t.getTime()
      if (!moonRise && !moonSet) return 0
      let up = false
      if (moonRise && moonSet)  up = moonRise < moonSet ? tm > moonRise.getTime() && tm < moonSet.getTime() : tm > moonRise.getTime() || tm < moonSet.getTime()
      else if (moonRise)        up = tm > moonRise.getTime()
      else if (moonSet)         up = tm < moonSet.getTime()
      if (!up) return 0
      let taper = 1.0
      if (moonRise) taper = Math.min(taper, Math.min(1, Math.abs(tm - moonRise.getTime()) / MOON_TAPER))
      if (moonSet)  taper = Math.min(taper, Math.min(1, Math.abs(tm - moonSet.getTime())  / MOON_TAPER))
      return taper
    }

    for (let i = 0; i < SLICES; i++) {
      const t0 = new Date(tStart.getTime() + (i / SLICES) * spanMs)
      const t1 = new Date(tStart.getTime() + ((i + 1) / SLICES) * spanMs)
      const mf = moonFrac(t0)
      if (mf <= 0.02) continue
      ctx.fillStyle = `rgba(180,200,240,${moonAlpha * mf})`
      ctx.fillRect(tx(t0), PAD_T, Math.ceil(tx(t1) - tx(t0)) + 1, moonH)
    }

    // ── 4. ZERO LINE ─────────────────────────────────────────────────────────
    const yZero = PAD_T + pH / 2
    ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 1.0
    ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(0, yZero); ctx.lineTo(cW, yZero); ctx.stroke()
    ctx.setLineDash([])

    // ── 5. BZ TRACE ──────────────────────────────────────────────────────────
    //
    // MENTAL MODEL (correct):
    //   L1 measurement at T_L1 reaches Earth at T_L1 + lagMs
    //   Most recent L1 reading ≈ taken "now" → reaches Earth at lagEnd (now + ~40min)
    //   L1 reading taken lagMs ago → reaching Earth RIGHT NOW (aligns with NOW line)
    //
    //   SOLID  : all real L1 data shifted by +lagMs
    //            spans from ~(tStart) to lagEnd, CROSSES the NOW line
    //            ~40min of solid data is to the RIGHT of the NOW line
    //   DASHED : slope extrapolation starting at lagEnd (beyond all measured data)
    //   NOW    : Earth's current clock — sits ~40min before end of solid data

    const realTrace  = (bzTrace || []).filter(p => p.bz !== null)
    const pipelineTL = (spaceWeather.timeline || []).filter(p => p?.bz != null)

    const allBzVals = [...realTrace.map(p => p.bz), spaceWeather.bz_now ?? 0]
    const bzMax = Math.max(8, ...allBzVals.map(Math.abs)) * 1.3
    function bzY(bz) {
      const y = yZero - (bz / bzMax) * (pH * 0.47)
      return Math.max(0, Math.min(cH, y))
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round'

    if (realTrace.length >= 2) {
      // SOLID — all L1 data, shifted by +lagMs, runs past NOW to lagEnd
      ctx.lineWidth = 1.8; ctx.setLineDash([]); ctx.globalAlpha = 0.92
      for (let i = 0; i < realTrace.length - 1; i++) {
        const a = realTrace[i], b = realTrace[i + 1]
        const tA = new Date(a.time.getTime() + lagMs)
        const tB = new Date(b.time.getTime() + lagMs)
        if (tB < tStart || tA > tEnd) continue
        const mid = (a.bz + b.bz) / 2
        ctx.strokeStyle = mid < 0 ? '#ee5577' : '#44ddaa'
        ctx.beginPath(); ctx.moveTo(tx(tA), bzY(a.bz)); ctx.lineTo(tx(tB), bzY(b.bz)); ctx.stroke()
      }
      ctx.globalAlpha = 1.0
    } else if (pipelineTL.length >= 2) {
      ctx.lineWidth = 1.8; ctx.setLineDash([])
      for (let i = 0; i < pipelineTL.length - 1; i++) {
        const a = pipelineTL[i], b = pipelineTL[i + 1]
        if (a.offset > 0 || b.offset > 0) continue
        const tA = new Date(now.getTime() + a.offset * 3600000)
        const tB = new Date(now.getTime() + b.offset * 3600000)
        const mid = (a.bz + b.bz) / 2
        ctx.strokeStyle = mid < 0 ? '#ee5577' : '#44ddaa'
        ctx.beginPath(); ctx.moveTo(tx(tA), bzY(a.bz)); ctx.lineTo(tx(tB), bzY(b.bz)); ctx.stroke()
      }
    }

    // bzNow = latest L1 reading (what will arrive at Earth at lagEnd)
    const bzNow = realTrace.length
      ? realTrace[realTrace.length - 1].bz
      : (spaceWeather.bz_now ?? 0)

    // DASHED propagated — starts at lagEnd, slope-extrapolated
    const lagHrs = lagMs / 3600000
    let propSlope = 0.0
    if (realTrace.length >= 5 && Math.abs(bzNow) >= 2.0) {
      const cutoff30 = new Date(now.getTime() - 30 * 60000)
      const w30 = realTrace.filter(p => p.time >= cutoff30)
      if (w30.length >= 5) {
        const t0 = w30[0].time.getTime()
        const raw = slope(w30, p => (p.time.getTime() - t0) / 3600000, p => p.bz)
        const taper = Math.min(1.0, (Math.abs(bzNow) - 2.0) / 2.0)
        propSlope = Math.max(-10, Math.min(10, raw)) * taper
      }
    }
    const bzAtLagEnd = bzNow + propSlope * lagHrs

    if (lagEnd > tStart && lagEnd <= tEnd) {
      const propColor = bzNow < 0 ? '#994466' : '#226644'
      const propEnd   = new Date(lagEnd.getTime() + lagHrs * 3600000)
      ctx.lineWidth = 1.4; ctx.setLineDash([4, 3])
      ctx.strokeStyle = propColor; ctx.globalAlpha = 0.50
      ctx.beginPath()
      ctx.moveTo(tx(lagEnd), bzY(bzNow))
      ctx.lineTo(Math.min(tx(propEnd), cW), bzY(bzAtLagEnd))
      ctx.stroke()
      ctx.setLineDash([]); ctx.globalAlpha = 1.0
    }

    // PREDICTION (fading dashed — only when clearly trending toward zero)
    let slope60 = 0.0, isMono = false
    if (realTrace.length >= 10) {
      const cutoff60 = new Date(now.getTime() - 60 * 60000)
      const w60 = realTrace.filter(p => p.time >= cutoff60)
      if (w60.length >= 10) {
        const t0 = w60[0].time.getTime()
        slope60 = slope(w60, p => (p.time.getTime() - t0) / 3600000, p => p.bz)
        const meanX    = w60.reduce((a, p) => a + (p.time.getTime() - t0) / 3600000, 0) / w60.length
        const fitted   = w60.map(p => bzNow + slope60 * ((p.time.getTime() - t0) / 3600000 - meanX))
        const residStd = Math.sqrt(w60.reduce((a, p, i) => a + (p.bz - fitted[i]) ** 2, 0) / w60.length)
        const signal   = Math.abs(w60[w60.length - 1].bz - w60[0].bz)
        isMono = signal > 2.0 && residStd < signal * 0.55
      }
    }
    const bzSouth = bzNow < -2.5, bzNorth = bzNow > 2.5
    if (isMono && ((bzSouth && slope60 > 1.5) || (bzNorth && slope60 < -1.5))) {
      const hrsToZero = Math.min(6, Math.abs(bzAtLagEnd) / Math.max(Math.abs(slope60), 0.1))
      const zeroT = new Date(lagEnd.getTime() + hrsToZero * 3600000)
      if (zeroT > lagEnd && zeroT <= tEnd) {
        const STEPS = 40, totalMs = zeroT - lagEnd, fadeStartMs = totalMs * 0.80
        for (let i = 0; i < STEPS - 1; i++) {
          const fracA = i / (STEPS - 1), fracB = (i + 1) / (STEPS - 1)
          const tA = new Date(lagEnd.getTime() + fracA * totalMs)
          const tB = new Date(lagEnd.getTime() + fracB * totalMs)
          const cfA = (1 - Math.cos(Math.PI * fracA)) / 2
          const cfB = (1 - Math.cos(Math.PI * fracB)) / 2
          const vA = bzAtLagEnd * (1 - cfA), vB = bzAtLagEnd * (1 - cfB)
          const elapsed = tA - lagEnd
          let alpha = elapsed > fadeStartMs
            ? 0.80 - ((elapsed - fadeStartMs) / (totalMs - fadeStartMs)) * 0.65
            : 0.80
          if (alpha < 0.03) break
          const mid = (vA + vB) / 2
          ctx.lineWidth = 1.6; ctx.setLineDash([5, 3])
          ctx.strokeStyle = mid < 0 ? `rgba(238,85,119,${alpha})` : `rgba(68,221,170,${alpha})`
          ctx.beginPath(); ctx.moveTo(tx(tA), bzY(vA)); ctx.lineTo(tx(tB), bzY(vB)); ctx.stroke()
        }
        ctx.setLineDash([]); ctx.globalAlpha = 1.0
      }
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1.0

    // ── 6. VELOCITY TRACE ─────────────────────────────────────────────────────
    //
    // Same shift logic as Bz:
    //   SOLID  : plasma_timeline (L1 timestamps) shifted by +lagMs → spans to lagEnd
    //   DASHED : ENLIL forecast from lagEnd onward
    //
    // Source priority:
    //   1. plasmaTrace from direct CORS fetch (if ≥5 valid points)
    //   2. spaceWeather.plasma_timeline from pipeline JSON
    //   3. Flat line synthesized from current scalar speed_kms/density_ncc

    const rawPlasma = (plasmaTrace != null && plasmaTrace.length >= 5)  // != catches both null and undefined
      ? plasmaTrace
      : (spaceWeather.plasma_timeline || []).length >= 5
        ? (spaceWeather.plasma_timeline).map(p => ({ time: new Date(p.time), speed: p.speed, density: p.density }))
        : null

    let plasma
    const speedNow = spaceWeather.speed_kms  || null
    const densNow  = spaceWeather.density_ncc || null

    if (rawPlasma && rawPlasma.filter(p => p.speed != null || p.density != null).length >= 5) {
      plasma = rawPlasma.filter(p => p.speed != null || p.density != null)
    } else {
      // Synthesize flat line at current scalar — spans -1hr to lagEnd in Earth time
      // These are already Earth-arrival times so flagged _wallclock to skip the +lagMs shift
      plasma = []
      if (speedNow || densNow) {
        for (let m = -60; m <= Math.ceil(lagMs / 60000) + 5; m += 5) {
          plasma.push({ time: new Date(now.getTime() + m * 60000), speed: speedNow, density: densNow, _wallclock: true })
        }
      }
    }

    const enlil = (spaceWeather.enlil_timeline || [])
      .map(p => ({ time: new Date(p.time), speed: p.speed, density: p.density }))
      .filter(p => p.speed != null || p.density != null)
      .sort((a, b) => a.time - b.time)

    // V scale — tight range around observed mean, minimum 100 km/s span
    const obsV   = plasma.map(p => p.speed).filter(v => v != null)
    const enlilV = enlil.map(p => p.speed).filter(v => v != null)
    const allV   = [...obsV, ...enlilV]
    // Fixed scale: 200–1100 km/s always
    // Quiet wind (~450) sits at 28%, fast stream (~700) at 56%, CME (~900) at 78%
    var vMin = 200, vMax = 1100
    const vRange = vMax - vMin
    function vY(v) { return Math.max(0, Math.min(cH, PAD_T + pH * (1 - (v - vMin) / vRange))) }

    // Observed V solid
    const vPoints = plasma.filter(p => p.speed != null)
    if (vPoints.length >= 2) {
      ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.globalAlpha = 0.80
      ctx.strokeStyle = '#4488ff'
      ctx.beginPath(); let started = false
      for (const p of vPoints) {
        const tP = p._wallclock ? p.time : new Date(p.time.getTime() + lagMs)
        if (tP < tStart || tP > tEnd) continue
        const x = tx(tP), y = vY(p.speed)
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke(); ctx.globalAlpha = 1.0
      ctx.fillStyle = '#2255aa'; ctx.font = `6.5px ${FONT}`
      ctx.fillText(`${Math.round(vMax)}`, cW - 26, PAD_T + 5)
      ctx.fillText(`${Math.round(vMin)}`, cW - 26, PAD_T + pH - 2)
    }

    // ENLIL V dashed from lagEnd
    const enlilVAfter = enlil.filter(p => p.speed != null && p.time >= lagEnd && p.time <= tEnd)
    if (enlilVAfter.length >= 2) {
      ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.60
      ctx.strokeStyle = '#4488ff'
      ctx.beginPath(); let started2 = false
      for (const p of enlilVAfter) {
        const x = tx(p.time), y = vY(p.speed)
        if (!started2) { ctx.moveTo(x, y); started2 = true } else ctx.lineTo(x, y)
      }
      ctx.stroke(); ctx.globalAlpha = 1.0
    }
    ctx.setLineDash([])

    // ── 7. DENSITY TRACE ──────────────────────────────────────────────────────
    const obsD   = plasma.map(p => p.density).filter(d => d != null)
    const enlilD = enlil.map(p => p.density).filter(d => d != null)
    const allD   = [...obsD, ...enlilD]
    // Fixed scale: 0–50 n/cc always
    // Quiet density (~5) sits at 10%, elevated (~20) at 40%, CME sheath (~40) at 80%
    let dMin = 0, dMax = 50
    const dRange = dMax - dMin
    function dY(d) { return Math.max(0, Math.min(cH, PAD_T + pH * (1 - (d - dMin) / dRange))) }

    const dPoints = plasma.filter(p => p.density != null)
    if (dPoints.length >= 2) {
      ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.globalAlpha = 0.75
      ctx.strokeStyle = '#bb66ff'
      ctx.beginPath(); let started3 = false
      for (const p of dPoints) {
        const tP = p._wallclock ? p.time : new Date(p.time.getTime() + lagMs)
        if (tP < tStart || tP > tEnd) continue
        const x = tx(tP), y = dY(p.density)
        if (!started3) { ctx.moveTo(x, y); started3 = true } else ctx.lineTo(x, y)
      }
      ctx.stroke(); ctx.globalAlpha = 1.0
      ctx.fillStyle = '#773399'; ctx.font = `6.5px ${FONT}`
      ctx.fillText(`${dMax.toFixed(0)}`, 1, PAD_T + 5)
      ctx.fillText(`0`, 1, PAD_T + pH - 2)
    }

    const enlilDAfter = enlil.filter(p => p.density != null && p.time >= lagEnd && p.time <= tEnd)
    if (enlilDAfter.length >= 2) {
      ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.60
      ctx.strokeStyle = '#bb66ff'
      ctx.beginPath(); let started4 = false
      for (const p of enlilDAfter) {
        const x = tx(p.time), y = dY(p.density)
        if (!started4) { ctx.moveTo(x, y); started4 = true } else ctx.lineTo(x, y)
      }
      ctx.stroke(); ctx.globalAlpha = 1.0
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1.0

    // ── 8. VERTICAL MARKERS ──────────────────────────────────────────────────
    function vLine(t, color, label, yFrac, dashed) {
      if (!t) return
      const dt = new Date(t)
      if (dt < tStart || dt > tEnd) return
      const x = tx(dt)
      ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.80
      ctx.setLineDash(dashed ? [4, 3] : [])
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + pH); ctx.stroke()
      ctx.setLineDash([]); ctx.globalAlpha = 1.0
      if (label) {
        ctx.fillStyle = color; ctx.font = `8.5px ${FONT}`
        ctx.fillText(label, x + 3, PAD_T + pH * yFrac)
      }
    }

    vLine(sun0.rise, '#ffdd44', '☀ Rise', 0.22, false)
    vLine(sun0.set,  '#ffdd44', '☀ Set',  0.22, false)
    vLine(sun1.rise, '#ffdd44', '☀ Rise', 0.22, false)
    vLine(moonRise,  '#aabbcc', '☽ Rise', 0.42, true)
    vLine(moonSet,   '#aabbcc', '☽ Set',  0.42, true)

    // L1→Earth lag marker (subtle dotted)
    if (lagEnd > tStart && lagEnd <= tEnd) {
      ctx.strokeStyle = '#334455'; ctx.lineWidth = 1.0; ctx.globalAlpha = 0.45
      ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.moveTo(tx(lagEnd), PAD_T); ctx.lineTo(tx(lagEnd), PAD_T + pH); ctx.stroke()
      ctx.setLineDash([]); ctx.globalAlpha = 1.0
      ctx.fillStyle = '#334455'; ctx.font = `7px ${FONT}`
      ctx.fillText('L1→⊕', tx(lagEnd) + 2, PAD_T + 9)
    }



    // ── 10. NOW LINE ─────────────────────────────────────────────────────────
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.0; ctx.globalAlpha = 0.75
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(tx(now), PAD_T); ctx.lineTo(tx(now), PAD_T + pH); ctx.stroke()
    ctx.globalAlpha = 1.0
    ctx.fillStyle = '#ffffff'; ctx.font = `bold 8.5px ${FONT}`
    ctx.fillText('NOW', tx(now) + 3, PAD_T + 11)

    // ── 11. SELECTED HOUR HIGHLIGHT ──────────────────────────────────────────
    // Selected hour box — always shown including hour 0 (NOW)
    {
      const hS = selectedHour === 0
        ? new Date(now.getTime() - 0.5 * 3600000)
        : new Date(now.getTime() + (selectedHour - 0.5) * 3600000)
      const hE = selectedHour === 0
        ? new Date(now.getTime() + 0.5 * 3600000)
        : new Date(now.getTime() + (selectedHour + 0.5) * 3600000)
      ctx.strokeStyle = selectedHour === 0 ? '#ffffff44' : '#ff4444'
      ctx.lineWidth = 1.5
      ctx.strokeRect(Math.max(0, tx(hS)), PAD_T + 1, tx(hE) - tx(hS), pH - 2)
    }

    // ── 12. HOUR TICK LABELS ──────────────────────────────────────────────────
    ctx.fillStyle = '#445566'; ctx.font = `bold 8px ${FONT}`
    for (let dh = -1; dh <= 8; dh++) {
      const t = new Date(now.getTime() + dh * 3600000)
      if (t < tStart || t > tEnd) continue
      const lbl = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' })
      ctx.fillText(lbl, tx(t) - 13, PAD_T + pH + 12)
    }

    // ── 13. Y LABELS (Bz nT scale) ───────────────────────────────────────────
    ctx.fillStyle = '#2a3a4a'; ctx.font = `7px ${FONT}`
    for (const v of [5, -5, 10, -10]) {
      const y = bzY(v)
      if (y < PAD_T + 4 || y > PAD_T + pH - 4) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v}`, 2, y + 3)
    }

    // ── 14. CURRENT VALUE BADGES ─────────────────────────────────────────────
    const lastV = plasma.length ? plasma[plasma.length - 1].speed   : speedNow
    const lastD = plasma.length ? plasma[plasma.length - 1].density : densNow
    ctx.font = `7.5px ${FONT}`
    if (lastV) { ctx.fillStyle = '#4488ff'; ctx.fillText(`V ${Math.round(lastV)} km/s`, cW - 90, PAD_T + 9) }
    if (lastD) { ctx.fillStyle = '#bb66ff'; ctx.fillText(`n ${Number(lastD).toFixed(1)} /cc`, cW - 90, PAD_T + 20) }

  }, [spaceWeather, moonData, selectedHour, bzTrace, plasmaTrace])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => canvas.dispatchEvent(new Event('resize')))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  function handleClick(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const x      = e.clientX - rect.left
    const now    = new Date()
    const tStart = new Date(now.getTime() - 3600000)
    const clickT = new Date(tStart.getTime() + (x / rect.width) * 9 * 3600000)
    const offset = Math.round((clickT - now) / 3600000)
    onHourSelect?.(Math.max(-1, Math.min(8, offset)))
  }

  return (
    <div style={{ background: '#04060d', overflow: 'hidden', display: 'block' }}>
      <canvas
        ref={canvasRef}
        onClick={helpMode ? () => onHelpTap?.('timeline') : handleClick}
        style={{ width: '100%', height: 90, display: 'block', overflow: 'hidden', cursor: helpMode ? 'pointer' : 'pointer' }}
      />
      <div onClick={() => helpMode && onHelpTap?.('legend_strip')} style={{ cursor: helpMode ? 'pointer' : 'default' }}>
        <LegendStrip />
      </div>
    </div>
  )
}
