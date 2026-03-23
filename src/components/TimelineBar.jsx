import { useEffect, useRef } from 'react'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const NY_LAT = 40.7128
const NY_LON = -74.0060

// ── Sun times (pure math, New York) ──────────────────────────────────────────
function sunTimes(date) {
  const n   = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000) - 10957)
  const J   = n + 0.0008
  const Ms  = (357.5291 + 0.98560028 * J) % 360
  const Mr  = Ms * Math.PI / 180
  const C   = 1.9148 * Math.sin(Mr) + 0.0200 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr)
  const lam = (Ms + C + 180 + 102.9372) % 360
  const Jt  = 2451545 + J + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam * Math.PI / 180)
  const d   = Math.asin(Math.sin((lam) * Math.PI / 180) * Math.sin(23.4397 * Math.PI / 180))
  const lat = NY_LAT * Math.PI / 180
  const lon = NY_LON
  const cosH = (Math.sin(-0.0145) - Math.sin(lat) * Math.sin(d)) / (Math.cos(lat) * Math.cos(d))
  if (Math.abs(cosH) > 1) return null
  const H = Math.acos(cosH) * 180 / Math.PI
  const noon = Jt - lon / 360
  const rise = (noon - H / 360 - 2451545) * 86400000
  const set  = (noon + H / 360 - 2451545) * 86400000
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    rise: new Date(base + rise % 86400000 + (rise < 0 ? 86400000 : 0)),
    set:  new Date(base + set  % 86400000 + (set  < 0 ? 86400000 : 0)),
  }
}

// ── Canvas timeline ───────────────────────────────────────────────────────────
export default function TimelineBar({ spaceWeather, moonData, selectedHour, onHourSelect }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width
    const H = canvas.height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    const now     = new Date()
    const tStart  = new Date(now.getTime() - 3600000)   // -1hr
    const tEnd    = new Date(now.getTime() + 8 * 3600000) // +8hr
    const spanMs  = tEnd - tStart

    // Convert time → x pixel
    function tx(t) {
      return ((t - tStart) / spanMs) * W
    }
    // x pixel → time
    function xt(x) {
      return new Date(tStart.getTime() + (x / W) * spanMs)
    }

    const PAD_TOP = 18
    const PAD_BOT = 18
    const plotH   = H - PAD_TOP - PAD_BOT

    // ── 1. BACKGROUND ────────────────────────────────────────────────────────
    ctx.fillStyle = '#04060d'
    ctx.fillRect(0, 0, W, H)

    // ── 2. DAYLIGHT SHADING (yellow, full height, tapered) ───────────────────
    const today = new Date(now)
    const tomorrow = new Date(now.getTime() + 86400000)
    const sunToday = sunTimes(today)
    const sunTomorrow = sunTimes(tomorrow)

    // Build daylight fraction array (like CME Watch's daylight_frac)
    const TAPER_MS = 45 * 60000 // 45 min taper
    function daylightFrac(t) {
      const events = []
      if (sunToday)    events.push({ rise: sunToday.rise,    set: sunToday.set })
      if (sunTomorrow) events.push({ rise: sunTomorrow.rise, set: sunTomorrow.set })
      for (const { rise, set } of events) {
        const dawnS = rise.getTime() - TAPER_MS
        const dawnE = rise.getTime() + TAPER_MS
        const duskS = set.getTime()  - TAPER_MS
        const duskE = set.getTime()  + TAPER_MS
        const tm = t.getTime()
        if (tm >= dawnE && tm <= duskS) return 1.0
        if (tm >= dawnS && tm <  dawnE) return (tm - dawnS) / (2 * TAPER_MS)
        if (tm >  duskS && tm <= duskE) return 1 - (tm - duskS) / (2 * TAPER_MS)
      }
      return 0.0
    }

    // Draw daylight as 200 vertical slices
    const SLICES = 300
    for (let i = 0; i < SLICES; i++) {
      const t0 = new Date(tStart.getTime() + (i / SLICES) * spanMs)
      const t1 = new Date(tStart.getTime() + ((i + 1) / SLICES) * spanMs)
      const d  = daylightFrac(t0)
      if (d <= 0) continue
      const x0 = tx(t0), x1 = tx(t1)
      ctx.fillStyle = `rgba(255, 220, 80, ${0.10 * d})`
      ctx.fillRect(x0, PAD_TOP, x1 - x0 + 1, plotH)
    }

    // ── 3. MOON SHADING (white, top 25%, tapered) ────────────────────────────
    const moonRise = spaceWeather.moon_rise ? new Date(spaceWeather.moon_rise) : null
    const moonSet  = spaceWeather.moon_set  ? new Date(spaceWeather.moon_set)  : null
    const moonIllum = spaceWeather.moon_illumination || 0
    const moonAlpha = Math.max(0.06, moonIllum * 0.40)
    const moonTop   = PAD_TOP
    const moonBotY  = PAD_TOP + plotH * 0.28  // top 28% only

    if (moonRise || moonSet) {
      function moonFrac(t) {
        const tm = t.getTime()
        const MOON_TAPER = 30 * 60000

        // Determine if moon is up
        let moonUp = false
        if (moonRise && moonSet) {
          if (moonRise < moonSet) moonUp = tm > moonRise.getTime() && tm < moonSet.getTime()
          else moonUp = tm > moonRise.getTime() || tm < moonSet.getTime()
        } else if (moonRise) {
          moonUp = tm > moonRise.getTime()
        } else if (moonSet) {
          moonUp = tm < moonSet.getTime()
        }

        // Taper near rise/set
        let taper = 1.0
        if (moonRise) {
          const fromRise = Math.abs(tm - moonRise.getTime())
          if (fromRise < MOON_TAPER) taper = Math.min(taper, fromRise / MOON_TAPER)
        }
        if (moonSet) {
          const fromSet = Math.abs(tm - moonSet.getTime())
          if (fromSet < MOON_TAPER) taper = Math.min(taper, fromSet / MOON_TAPER)
        }
        return moonUp ? taper : 0.0
      }

      for (let i = 0; i < SLICES; i++) {
        const t0 = new Date(tStart.getTime() + (i / SLICES) * spanMs)
        const t1 = new Date(tStart.getTime() + ((i + 1) / SLICES) * spanMs)
        const mf = moonFrac(t0)
        if (mf <= 0) continue
        const x0 = tx(t0), x1 = tx(t1)
        ctx.fillStyle = `rgba(180, 200, 230, ${moonAlpha * mf})`
        ctx.fillRect(x0, moonTop, x1 - x0 + 1, moonBotY - moonTop)
      }
    }

    // ── 4. ZERO LINE ─────────────────────────────────────────────────────────
    const yZero = PAD_TOP + plotH / 2
    ctx.strokeStyle = '#2a3a4a'
    ctx.lineWidth = 0.9
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, yZero); ctx.lineTo(W, yZero)
    ctx.stroke()
    ctx.setLineDash([])

    // ── 5. BZ TRACE ──────────────────────────────────────────────────────────
    const bzTimeline = spaceWeather.timeline || []
    // y from bz value
    const bzValues = bzTimeline.map(p => p.bz).filter(v => v != null)
    const bzMax = Math.max(15, ...bzValues.map(Math.abs)) * 1.3

    function bzY(bz) {
      return yZero - (bz / bzMax) * (plotH / 2) * 0.92
    }

    // Observed segment (solid, sign-coloured)
    const obsPoints = bzTimeline.filter(p => p.offset <= 0 && p.bz != null)
    if (obsPoints.length >= 2) {
      for (let i = 0; i < obsPoints.length - 1; i++) {
        const a = obsPoints[i], b = obsPoints[i + 1]
        const tA = new Date(now.getTime() + a.offset * 3600000)
        const tB = new Date(now.getTime() + b.offset * 3600000)
        const midBz = (a.bz + b.bz) / 2
        ctx.strokeStyle = midBz < 0 ? '#ee5577' : '#44ddaa'
        ctx.lineWidth = 2.5
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(tx(tA), bzY(a.bz))
        ctx.lineTo(tx(tB), bzY(b.bz))
        ctx.stroke()
      }
    }

    // Propagated segment (dashed, dim) — flat from now for 40min
    const lagMs = (1.5e6 / (spaceWeather.speed_kms || 450)) * 1000
    const lagEnd = new Date(now.getTime() + lagMs)
    const bzNow = spaceWeather.bz_now || 0
    if (lagEnd > now && lagEnd <= tEnd) {
      ctx.strokeStyle = bzNow < 0 ? '#884455' : '#226644'
      ctx.lineWidth = 1.6
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(tx(now), bzY(bzNow))
      ctx.lineTo(tx(lagEnd), bzY(bzNow))
      ctx.stroke()
    }

    // Prediction segment (dashed, fading) — from lagEnd forward using forecast points
    const predPoints = bzTimeline.filter(p => p.offset > 0 && p.bz != null)
    if (predPoints.length >= 2) {
      const totalPredMs = predPoints[predPoints.length - 1].offset * 3600000
      const fadeStartFrac = 0.80
      for (let i = 0; i < predPoints.length - 1; i++) {
        const a = predPoints[i], b = predPoints[i + 1]
        const tA = new Date(now.getTime() + a.offset * 3600000)
        const tB = new Date(now.getTime() + b.offset * 3600000)
        const frac = a.offset / (predPoints[predPoints.length - 1].offset || 1)
        const alpha = frac < fadeStartFrac
          ? 0.75
          : 0.75 - ((frac - fadeStartFrac) / (1 - fadeStartFrac)) * 0.65
        if (alpha < 0.05) continue
        const midBz = (a.bz + b.bz) / 2
        ctx.strokeStyle = midBz < 0
          ? `rgba(238,85,119,${alpha})`
          : `rgba(68,221,170,${alpha})`
        ctx.lineWidth = 1.8
        ctx.setLineDash([5, 3])
        ctx.beginPath()
        ctx.moveTo(tx(tA), bzY(a.bz))
        ctx.lineTo(tx(tB), bzY(b.bz))
        ctx.stroke()
      }
    }
    ctx.setLineDash([])

    // ── 6. VERTICAL LINES: Sunrise, Sunset, Moonrise, Moonset ───────────────
    function drawVLine(t, color, label, yFrac = 0.88, dashed = false) {
      if (!t || t < tStart || t > tEnd) return
      const x = tx(t)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.3
      ctx.setLineDash(dashed ? [4, 3] : [])
      ctx.globalAlpha = 0.75
      ctx.beginPath()
      ctx.moveTo(x, PAD_TOP); ctx.lineTo(x, PAD_TOP + plotH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1.0
      if (label) {
        ctx.fillStyle = color
        ctx.font = `9px ${FONT}`
        ctx.fillText(label, x + 3, PAD_TOP + plotH * yFrac)
      }
    }

    if (sunToday) {
      drawVLine(sunToday.set,  '#ffdd44', 'Sunset',  0.22)
      drawVLine(sunToday.rise, '#ffdd44', 'Sunrise', 0.22)
    }
    if (sunTomorrow) {
      drawVLine(sunTomorrow.rise, '#ffdd44', 'Sunrise', 0.22)
    }
    if (moonRise) drawVLine(moonRise, '#aabbcc', '☽ Rise', 0.38, true)
    if (moonSet)  drawVLine(moonSet,  '#aabbcc', '☽ Set',  0.38, true)

    // ── 7. NOW LINE ──────────────────────────────────────────────────────────
    const nowX = tx(now)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.0
    ctx.globalAlpha = 0.70
    ctx.beginPath()
    ctx.moveTo(nowX, PAD_TOP); ctx.lineTo(nowX, PAD_TOP + plotH)
    ctx.stroke()
    ctx.globalAlpha = 1.0
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 9px ${FONT}`
    ctx.fillText('NOW', nowX + 3, PAD_TOP + 10)

    // ── 8. SELECTED HOUR BOX (red outline) ────────────────────────────────────
    if (selectedHour !== 0) {
      const hStart = new Date(now.getTime() + (selectedHour - 0.5) * 3600000)
      const hEnd   = new Date(now.getTime() + (selectedHour + 0.5) * 3600000)
      const hx0 = Math.max(0, tx(hStart))
      const hx1 = Math.min(W, tx(hEnd))
      ctx.strokeStyle = '#ff4444'
      ctx.lineWidth = 1.5
      ctx.strokeRect(hx0, PAD_TOP, hx1 - hx0, plotH)
    }

    // ── 9. HOUR TICK LABELS ──────────────────────────────────────────────────
    ctx.fillStyle = '#445566'
    ctx.font = `8px ${FONT}`
    for (let dh = -1; dh <= 8; dh += 1) {
      const t = new Date(now.getTime() + dh * 3600000)
      if (t < tStart || t > tEnd) continue
      const x = tx(t)
      const label = t.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/New_York',
      })
      ctx.fillText(label, x - 14, PAD_TOP + plotH + 12)
    }

    // ── 10. Y-AXIS LABELS ────────────────────────────────────────────────────
    ctx.fillStyle = '#2a3a4a'
    ctx.font = `7px ${FONT}`
    for (const v of [5, -5, 10, -10]) {
      const y = bzY(v)
      if (y < PAD_TOP || y > PAD_TOP + plotH) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v}`, 2, y + 3)
    }

  }, [spaceWeather, moonData, selectedHour])

  // Handle click to select hour
  function handleClick(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const now = new Date()
    const tStart = new Date(now.getTime() - 3600000)
    const tEnd   = new Date(now.getTime() + 8 * 3600000)
    const spanMs = tEnd - tStart
    const clickTime = new Date(tStart.getTime() + (x / canvas.width) * spanMs)
    const offsetHrs = Math.round((clickTime - now) / 3600000)
    const clamped = Math.max(-1, Math.min(8, offsetHrs))
    if (onHourSelect) onHourSelect(clamped)
  }

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={1000}
        height={80}
        onClick={handleClick}
        style={{
          width: '100%', height: 80,
          display: 'block', cursor: 'pointer',
        }}
      />
    </div>
  )
}
