import { useEffect, useRef } from 'react'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const NY_LAT = 40.7128
const NY_LON = -74.0060

// ── Sun times — ported from CME Watch _sun_times (known correct) ─────────────
function sunTimes(date) {
  const n = date.getUTCMonth() * 30 + date.getUTCDate() // approx day of year
  // More accurate day of year
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff  = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start
  const doy   = Math.floor(diff / 86400000)

  const B    = (Math.PI * 2 / 365) * (doy - 81)
  const eot  = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
  const decl = Math.asin(Math.sin(Math.PI * 2 / 365 * (doy - 81)) * Math.sin(23.45 * Math.PI / 180))

  const latR  = NY_LAT * Math.PI / 180
  let cosHA   = (Math.sin(-0.833 * Math.PI / 180) - Math.sin(latR) * Math.sin(decl)) /
                (Math.cos(latR) * Math.cos(decl))
  cosHA       = Math.max(-1, Math.min(1, cosHA))
  const ha    = Math.acos(cosHA) * 180 / Math.PI   // degrees

  const noonMin = 720 - 4 * NY_LON - eot
  const srMin   = noonMin - ha * 4
  const ssMin   = noonMin + ha * 4

  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    rise: new Date(base + srMin * 60000),
    set:  new Date(base + ssMin * 60000),
  }
}

// ── Canvas timeline ───────────────────────────────────────────────────────────
export default function TimelineBar({ spaceWeather, moonData, selectedHour, onHourSelect, bzTrace }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set actual pixel dimensions
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    const W = canvas.width
    const H = canvas.height

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const cW = rect.width
    const cH = rect.height

    ctx.clearRect(0, 0, cW, cH)

    const now    = new Date()
    const tStart = new Date(now.getTime() - 3600000)
    const tEnd   = new Date(now.getTime() + 8 * 3600000)
    const spanMs = tEnd - tStart

    function tx(t) { return ((t - tStart) / spanMs) * cW }

    const PAD_T = 16
    const PAD_B = 16
    const pH    = cH - PAD_T - PAD_B   // plot height

    // ── 1. BACKGROUND ────────────────────────────────────────────────────────
    ctx.fillStyle = '#04060d'
    ctx.fillRect(0, 0, cW, cH)

    // ── 2. DAYLIGHT SHADING ───────────────────────────────────────────────────
    const today    = new Date(now)
    const tomorrow = new Date(now.getTime() + 86400000)
    const sun0 = sunTimes(today)
    const sun1 = sunTimes(tomorrow)

    const TAPER = 45 * 60000  // 45min taper

    function dayFrac(t) {
      const tm = t.getTime()
      for (const { rise, set } of [sun0, sun1]) {
        if (!rise || !set) continue
        const dawnS = rise.getTime() - TAPER
        const dawnE = rise.getTime() + TAPER
        const duskS = set.getTime()  - TAPER
        const duskE = set.getTime()  + TAPER
        if (tm >= dawnE && tm <= duskS) return 1.0
        if (tm >= dawnS && tm <  dawnE) return (tm - dawnS) / (2 * TAPER)
        if (tm >  duskS && tm <= duskE) return 1.0 - (tm - duskS) / (2 * TAPER)
      }
      return 0.0
    }

    // Render daylight as gradient slices
    const SLICES = 300
    for (let i = 0; i < SLICES; i++) {
      const t0 = new Date(tStart.getTime() + (i / SLICES) * spanMs)
      const t1 = new Date(tStart.getTime() + ((i + 1) / SLICES) * spanMs)
      const d  = dayFrac(t0)
      if (d <= 0.02) continue
      const x0 = tx(t0), x1 = tx(t1)
      ctx.fillStyle = `rgba(255, 210, 60, ${0.18 * d})`
      ctx.fillRect(x0, PAD_T, Math.ceil(x1 - x0) + 1, pH)
    }

    // ── 3. MOON SHADING (top 28%, white-blue) ────────────────────────────────
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
      if (moonRise && moonSet) {
        up = moonRise < moonSet
          ? tm > moonRise.getTime() && tm < moonSet.getTime()
          : tm > moonRise.getTime() || tm < moonSet.getTime()
      } else if (moonRise) up = tm > moonRise.getTime()
      else if (moonSet)    up = tm < moonSet.getTime()
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
      const x0 = tx(t0), x1 = tx(t1)
      ctx.fillStyle = `rgba(180, 200, 240, ${moonAlpha * mf})`
      ctx.fillRect(x0, PAD_T, Math.ceil(x1 - x0) + 1, moonH)
    }

    // ── 4. ZERO LINE ─────────────────────────────────────────────────────────
    const yZero = PAD_T + pH / 2
    ctx.strokeStyle = '#2a3a4a'
    ctx.lineWidth   = 1.0
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, yZero); ctx.lineTo(cW, yZero)
    ctx.stroke()
    ctx.setLineDash([])

    // ── 5. BZ TRACE ──────────────────────────────────────────────────────────
    // Use real-time minute data if available, fall back to pipeline hourly
    const realTrace = (bzTrace || []).filter(p => p.bz !== null)
    const pipelineTL = (spaceWeather.timeline || []).filter(p => p?.bz != null)

    // Compute y-scale from all available data
    const allBz = [
      ...realTrace.map(p => p.bz),
      ...pipelineTL.map(p => p.bz),
      spaceWeather.bz_now ?? 0,
    ]
    const bzMax = Math.max(8, ...allBz.map(Math.abs)) * 1.3

    function bzY(bz) {
      // Use full plot height with padding
      return yZero - (bz / bzMax) * (pH * 0.47)
    }

    ctx.lineJoin = 'round'
    ctx.lineCap  = 'round'

    if (realTrace.length >= 2) {
      // Draw real minute-resolution observed trace
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      for (let i = 0; i < realTrace.length - 1; i++) {
        const a = realTrace[i], b = realTrace[i+1]
        const mid = (a.bz + b.bz) / 2
        ctx.strokeStyle = mid < 0 ? '#ee5577' : '#44ddaa'
        ctx.beginPath()
        ctx.moveTo(tx(a.time), bzY(a.bz))
        ctx.lineTo(tx(b.time), bzY(b.bz))
        ctx.stroke()
      }
    } else {
      // Fall back to pipeline hourly observed points
      const obs = pipelineTL.filter(p => p.offset <= 0)
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      for (let i = 0; i < obs.length - 1; i++) {
        const a = obs[i], b = obs[i+1]
        const ta = new Date(now.getTime() + a.offset * 3600000)
        const tb = new Date(now.getTime() + b.offset * 3600000)
        const mid = (a.bz + b.bz) / 2
        ctx.strokeStyle = mid < 0 ? '#ee5577' : '#44ddaa'
        ctx.beginPath()
        ctx.moveTo(tx(ta), bzY(a.bz))
        ctx.lineTo(tx(tb), bzY(b.bz))
        ctx.stroke()
      }
    }

    // Propagated: flat from now ~40min based on solar wind speed
    const bzNow  = realTrace.length ? realTrace[realTrace.length-1].bz : (spaceWeather.bz_now ?? 0)
    const lagMs  = Math.min((1.5e6 / (spaceWeather.speed_kms || 450)) * 1000, 5400000)
    const lagEnd = new Date(now.getTime() + lagMs)
    if (lagEnd > now) {
      ctx.lineWidth = 1.8
      ctx.setLineDash([7, 4])
      ctx.strokeStyle = bzNow < 0 ? '#994466' : '#226644'
      ctx.beginPath()
      ctx.moveTo(tx(now), bzY(bzNow))
      ctx.lineTo(tx(lagEnd < tEnd ? lagEnd : tEnd), bzY(bzNow))
      ctx.stroke()
    }

    // Prediction: pipeline future points, fading dashed
    const pred = pipelineTL.filter(p => p.offset > 0)
    if (pred.length >= 2) {
      const lastOffset = pred[pred.length-1].offset
      for (let i = 0; i < pred.length - 1; i++) {
        const a = pred[i], b = pred[i+1]
        const ta = new Date(now.getTime() + a.offset * 3600000)
        const tb = new Date(now.getTime() + b.offset * 3600000)
        const frac  = a.offset / lastOffset
        const alpha = frac < 0.8 ? 0.70 : 0.70 - (frac-0.8)/0.2*0.60
        if (alpha < 0.05) continue
        const mid = (a.bz + b.bz) / 2
        ctx.lineWidth = 1.8
        ctx.setLineDash([5, 3])
        ctx.strokeStyle = mid < 0 ? `rgba(238,85,119,${alpha})` : `rgba(68,221,170,${alpha})`
        ctx.beginPath()
        ctx.moveTo(tx(ta), bzY(a.bz))
        ctx.lineTo(tx(tb), bzY(b.bz))
        ctx.stroke()
      }
    }
    ctx.setLineDash([])

    // ── 6. VERTICAL MARKERS ──────────────────────────────────────────────────
    function vLine(t, color, label, yFrac, dashed) {
      if (!t) return
      const dt = new Date(t)
      if (dt < tStart || dt > tEnd) return
      const x = tx(dt)
      ctx.strokeStyle = color
      ctx.lineWidth   = 1.3
      ctx.globalAlpha = 0.80
      ctx.setLineDash(dashed ? [4, 3] : [])
      ctx.beginPath()
      ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + pH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1.0
      if (label) {
        ctx.fillStyle = color
        ctx.font = `8.5px ${FONT}`
        ctx.fillText(label, x + 3, PAD_T + pH * yFrac)
      }
    }

    // Sun — correct labels: rise = Sunrise, set = Sunset
    if (sun0) {
      vLine(sun0.rise, '#ffdd44', 'Sunrise', 0.22, false)
      vLine(sun0.set,  '#ffdd44', 'Sunset',  0.22, false)
    }
    if (sun1) {
      vLine(sun1.rise, '#ffdd44', 'Sunrise', 0.22, false)
    }

    // Moon
    vLine(moonRise, '#aabbcc', '☽ Rise', 0.42, true)
    vLine(moonSet,  '#aabbcc', '☽ Set',  0.42, true)

    // ── 7. NOW LINE ──────────────────────────────────────────────────────────
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth   = 2.0
    ctx.globalAlpha = 0.75
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(tx(now), PAD_T); ctx.lineTo(tx(now), PAD_T + pH)
    ctx.stroke()
    ctx.globalAlpha = 1.0
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 8.5px ${FONT}`
    ctx.fillText('NOW', tx(now) + 3, PAD_T + 11)

    // ── 8. SELECTED HOUR HIGHLIGHT BOX ───────────────────────────────────────
    if (selectedHour !== null && selectedHour !== 0) {
      const hS = new Date(now.getTime() + (selectedHour - 0.5) * 3600000)
      const hE = new Date(now.getTime() + (selectedHour + 0.5) * 3600000)
      const x0 = Math.max(0,  tx(hS))
      const x1 = Math.min(cW, tx(hE))
      ctx.strokeStyle = '#ff4444'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x0, PAD_T + 1, x1 - x0, pH - 2)
    }

    // ── 9. HOUR TICK LABELS ──────────────────────────────────────────────────
    ctx.fillStyle = '#445566'
    ctx.font = `8px ${FONT}`
    for (let dh = -1; dh <= 8; dh++) {
      const t = new Date(now.getTime() + dh * 3600000)
      if (t < tStart || t > tEnd) continue
      const x = tx(t)
      const lbl = t.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/New_York',
      })
      ctx.fillText(lbl, x - 13, PAD_T + pH + 12)
    }

    // ── 10. Y LABELS ─────────────────────────────────────────────────────────
    ctx.fillStyle = '#2a3a4a'
    ctx.font = `7px ${FONT}`
    for (const v of [5, -5, 10, -10]) {
      const y = bzY(v)
      if (y < PAD_T + 4 || y > PAD_T + pH - 4) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v}`, 2, y + 3)
    }

  }, [spaceWeather, moonData, selectedHour, bzTrace])

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      // Trigger re-render by dispatching a custom event
      canvas.dispatchEvent(new Event('resize'))
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  function handleClick(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const now  = new Date()
    const tStart = new Date(now.getTime() - 3600000)
    const spanMs = 9 * 3600000
    const clickT = new Date(tStart.getTime() + (x / rect.width) * spanMs)
    const offset = Math.round((clickT - now) / 3600000)
    onHourSelect?.(Math.max(-1, Math.min(8, offset)))
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{ width: '100%', height: 90, display: 'block', cursor: 'pointer' }}
    />
  )
}
