import { Polyline, Polygon } from 'react-leaflet'

// Color scale: teal (low) → yellow → red (high intensity)
function probToColor(prob) {
  const t = Math.min(1, Math.max(0, (prob - 10) / 70))
  if (t < 0.4) {
    const s = t / 0.4
    return { r: Math.round(20 + 80*s), g: Math.round(200), b: Math.round(170 - 100*s) }
  } else if (t < 0.7) {
    const s = (t - 0.4) / 0.3
    return { r: Math.round(100 + 155*s), g: Math.round(200 - 20*s), b: Math.round(70 - 70*s) }
  } else {
    const s = (t - 0.7) / 0.3
    return { r: 255, g: Math.round(180 - 150*s), b: 0 }
  }
}

function toRgba(c, alpha) {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}

// Safe cosine interpolation — only between close longitudes
function smoothLine(points, steps = 3) {
  if (points.length < 2) return points
  const out = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    // Skip large longitude gaps
    if (Math.abs(b[1] - a[1]) > 20) { out.push(a); continue }
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const tc = (1 - Math.cos(t * Math.PI)) / 2
      const lat = a[0] + (b[0] - a[0]) * tc
      const lon = a[1] + (b[1] - a[1]) * tc
      if (isFinite(lat) && isFinite(lon)) out.push([lat, lon])
    }
  }
  return out
}

function splitAtGaps(points, threshold = 15) {
  if (!points.length) return []
  const segs = []
  let cur = [points[0]]
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i][1] - points[i-1][1]) > threshold) {
      if (cur.length > 1) segs.push(cur)
      cur = []
    }
    cur.push(points[i])
  }
  if (cur.length > 1) segs.push(cur)
  return segs
}

export default function OvationLines({ spaceWeather }) {
  const oval     = spaceWeather?.ovation_oval    || []
  const viewLine = spaceWeather?.ovation_viewline || []

  if (!oval.length && !viewLine.length) return null

  // Filter bad coords, sort by longitude
  const sorted = oval
    .filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
    .sort((a, b) => a[1] - b[1])

  // Extract south boundary and north edge (with fallback for old 2-elem data)
  const southPts = sorted.map(p => [p[0], p[1]])
  const northPts = sorted.map(p => {
    const latNorth = (isFinite(p[4]) ? p[4] : p[0] + 4)
    return [latNorth, p[1]]
  })

  // Smooth both lines
  const smoothSouth = smoothLine(southPts)
  const smoothNorth = smoothLine(northPts)

  // Split into antimeridian-safe segments
  const southSegs = splitAtGaps(smoothSouth)
  const northSegs = splitAtGaps(smoothNorth)

  // Build fill polygons — pair each south segment with corresponding north segment
  // Use simple index-matched approach: split both at same longitude gaps
  const fillPolygons = southSegs.map((sSeg, i) => {
    const nSeg = northSegs[i]
    if (!nSeg || nSeg.length < 2) return null
    // Ring: south edge forward + north edge reversed = closed polygon
    const ring = [...sSeg, ...[...nSeg].reverse()]
    // Verify all coords are finite
    if (ring.some(p => !isFinite(p[0]) || !isFinite(p[1]))) return null
    return ring
  }).filter(Boolean)

  // Average intensity across oval for color
  const avgProb = sorted.length
    ? sorted.reduce((s, p) => s + (isFinite(p[2]) ? p[2] : 30), 0) / sorted.length
    : 30
  const fillColorObj = probToColor(avgProb)
  const fillColor = toRgba(fillColorObj, 0.30)
  const lineColor = toRgba({ r: 68, g: 221, b: 170 }, 0.9)

  // View line
  const sortedView = viewLine
    .filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
    .sort((a, b) => a[1] - b[1])
  const viewSegs = splitAtGaps(smoothLine(sortedView))

  return (
    <>
      {/* Aurora band fill */}
      {fillPolygons.map((ring, i) => (
        <Polygon
          key={`fill-${i}`}
          positions={ring}
          pathOptions={{
            color: lineColor,
            weight: 0,
            fillColor: fillColor,
            fillOpacity: 1,
            stroke: false,
            smoothFactor: 3,
          }}
        />
      ))}

      {/* Smooth oval boundary */}
      {southSegs.map((seg, i) => (
        <Polyline
          key={`oval-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 2, opacity: 0.9, smoothFactor: 3 }}
        />
      ))}

      {/* Dashed view line */}
      {viewSegs.map((seg, i) => (
        <Polyline
          key={`view-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.4, dashArray: '6 4', smoothFactor: 3 }}
        />
      ))}
    </>
  )
}
