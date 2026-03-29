import { useEffect, useRef } from 'react'
import { useMap, Polyline } from 'react-leaflet'
import L from 'leaflet'

// Intensity color scale — teal (low) → green → yellow → orange → red (high)
// Maps aurora probability 0-100 to a color
function probToRGB(prob) {
  const t = Math.min(1, Math.max(0, prob / 80))  // saturate at 80% prob
  if (t < 0.33) {
    // teal → green
    const s = t / 0.33
    return [Math.round(0 + 80*s), Math.round(200 - 20*s), Math.round(170 - 100*s)]
  } else if (t < 0.66) {
    // green → yellow-orange
    const s = (t - 0.33) / 0.33
    return [Math.round(80 + 175*s), Math.round(180 + 40*s), Math.round(70 - 70*s)]
  } else {
    // yellow-orange → red
    const s = (t - 0.66) / 0.34
    return [Math.round(255), Math.round(220 - 190*s), Math.round(0)]
  }
}

// Cosine interpolation between oval points for smooth line
function interpolateOval(points, steps = 4) {
  if (points.length < 2) return points
  const out = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    // Skip large longitude gaps (antimeridian)
    const lonGap = Math.abs(b[1] - a[1])
    if (lonGap > 30) { out.push(a); continue }
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const tc = (1 - Math.cos(t * Math.PI)) / 2
      out.push([
        a[0] + (b[0] - a[0]) * tc,
        a[1] + (b[1] - a[1]) * tc,
      ])
    }
  }
  return out
}

// Split points at antimeridian gaps
function splitAtGaps(points, gapThreshold = 15) {
  if (!points.length) return []
  const segments = []
  let current = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const gap = Math.abs(points[i][1] - points[i-1][1])
    if (gap > gapThreshold) { segments.push(current); current = [points[i]] }
    else current.push(points[i])
  }
  segments.push(current)
  return segments.filter(s => s.length > 1)
}

// Canvas layer for the aurora fill
function OvationFillLayer({ oval }) {
  const map = useMap()
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!oval.length) return
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:200;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    function redraw() {
      if (!canvasRef.current) return
      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)
      canvas.width = W; canvas.height = H
      canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px'
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)

      // Sort oval by longitude
      const sorted = [...oval].sort((a, b) => a[1] - b[1])

      // Draw each longitude column as a vertical strip
      for (let i = 0; i < sorted.length; i++) {
        const pt = sorted[i]
        const latSouth = pt[0], lon = pt[1]
        const maxProb = pt[2] ?? 30   // fallback for old 2-element data
        const latPeak = pt[3] ?? (latSouth + 2)
        const latNorth = pt[4] ?? (latSouth + 4)
        if (maxProb < 5) continue

        // Determine strip width from adjacent point
        const next = sorted[i + 1]
        const lonWidth = next ? Math.abs(next[1] - lon) : 1
        if (lonWidth > 5) continue  // skip antimeridian gap

        // Convert to screen coordinates
        const pSouth = map.containerPointToLayerPoint(
          map.latLngToContainerPoint([latSouth, lon])
        )
        const pNorth = map.containerPointToLayerPoint(
          map.latLngToContainerPoint([latNorth + 1, lon])
        )
        const pRight = map.containerPointToLayerPoint(
          map.latLngToContainerPoint([latSouth, lon + lonWidth])
        )

        const x = pSouth.x * dpr
        const yBottom = pSouth.y * dpr
        const yTop = pNorth.y * dpr
        const stripW = Math.max(2, (pRight.x - pSouth.x) * dpr + 1)
        const stripH = yBottom - yTop

        if (stripH <= 0 || stripW <= 0) continue

        // Gradient from south edge (transparent) → peak (colored) → north edge (transparent)
        const peakPt = map.containerPointToLayerPoint(
          map.latLngToContainerPoint([latPeak, lon])
        )
        const yPeak = peakPt.y * dpr

        const [r, g, b] = probToRGB(maxProb)
        const alpha = Math.min(0.55, 0.15 + (maxProb / 100) * 0.4)

        const grad = ctx.createLinearGradient(x, yBottom, x, yTop)
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
        grad.addColorStop(Math.max(0, Math.min(1, (yBottom - yPeak) / stripH)), `rgba(${r},${g},${b},${alpha})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)

        ctx.fillStyle = grad
        ctx.fillRect(x, yTop, stripW, stripH)
      }
    }

    redraw()
    map.on('moveend zoomend resize', redraw)
    return () => {
      map.off('moveend zoomend resize', redraw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [map, oval])

  return null
}

export default function OvationLines({ spaceWeather, selectedHour }) {
  const oval     = spaceWeather?.ovation_oval     || []
  const viewLine = spaceWeather?.ovation_viewline  || []
  const obsTime  = spaceWeather?.ovation_obs_time  || null

  if (!oval.length && !viewLine.length) return null

  const timeLabel = obsTime
    ? `${new Date(obsTime).toUTCString().slice(17, 22)} UTC`
    : ''

  // Build smooth boundary line from lat_south (index 0) per point
  const boundaryPoints = oval.map(p => [p[0], p[1]])
  const sortedBoundary = [...boundaryPoints].sort((a, b) => a[1] - b[1])
  const smoothBoundary = interpolateOval(sortedBoundary, 4)
  const boundarySegments = splitAtGaps(smoothBoundary, 5)

  // View line
  const sortedView = [...viewLine].sort((a, b) => a[1] - b[1])
  const smoothView = interpolateOval(sortedView, 4)
  const viewSegments = splitAtGaps(smoothView, 5)

  return (
    <>
      {/* Aurora fill */}
      <OvationFillLayer oval={oval} />

      {/* Smooth oval boundary line */}
      {boundarySegments.map((seg, i) => (
        <Polyline
          key={`oval-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 2, opacity: 0.9, smoothFactor: 1 }}
        />
      ))}

      {/* Dashed view line */}
      {viewSegments.map((seg, i) => (
        <Polyline
          key={`view-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.4, dashArray: '6 4', smoothFactor: 1 }}
        />
      ))}
    </>
  )
}
