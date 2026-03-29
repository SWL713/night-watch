import { Polyline, Polygon } from 'react-leaflet'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

// Intensity color: teal (low) → yellow → red (high)
function probToHex(prob) {
  const t = Math.min(1, Math.max(0, (prob - 10) / 70))
  if (t < 0.5) {
    const s = t / 0.5
    return `rgba(${Math.round(20 + 235*s)}, ${Math.round(200 - 0*s)}, ${Math.round(160 - 160*s)}, 0.35)`
  } else {
    const s = (t - 0.5) / 0.5
    return `rgba(255, ${Math.round(200 - 170*s)}, 0, ${0.35 + s * 0.15})`
  }
}

// Cosine-smooth a sorted set of [lat, lon] points, return interpolated array
function smoothPoints(points, steps = 3) {
  if (points.length < 2) return points
  const out = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (Math.abs(b[1] - a[1]) > 20) { out.push(a); continue }
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const tc = (1 - Math.cos(t * Math.PI)) / 2
      out.push([a[0] + (b[0] - a[0]) * tc, a[1] + (b[1] - a[1]) * tc])
    }
  }
  return out
}

function splitAtGaps(points, threshold = 15) {
  if (!points.length) return []
  const segs = []
  let cur = [points[0]]
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i][1] - points[i-1][1]) > threshold) { segs.push(cur); cur = [] }
    cur.push(points[i])
  }
  segs.push(cur)
  return segs.filter(s => s.length > 1)
}

export default function OvationLines({ spaceWeather, selectedHour }) {
  const oval     = spaceWeather?.ovation_oval     || []
  const viewLine = spaceWeather?.ovation_viewline  || []
  const obsTime  = spaceWeather?.ovation_obs_time  || null

  if (!oval.length && !viewLine.length) return null

  // Extract boundary and north-edge from oval data (handle both old 2-elem and new 5-elem)
  const sorted = [...oval].sort((a, b) => a[1] - b[1])

  const southPts = sorted.map(p => [p[0], p[1]])
  const northPts = sorted.map(p => {
    const latNorth = p[4] ?? (p[0] + 4)
    return [latNorth, p[1]]
  })

  // Smooth boundary lines
  const smoothSouth = smoothPoints(southPts)
  const smoothNorth = smoothPoints(northPts)
  const southSegs   = splitAtGaps(smoothSouth)
  const viewSegs    = splitAtGaps(smoothPoints([...viewLine].sort((a,b) => a[1]-b[1])))

  // Build fill polygons per segment (south edge + reversed north edge = closed ring)
  // Split at same antimeridian gaps
  const fillPolygons = []
  let southSeg = [], northSeg = []
  for (let i = 0; i < smoothSouth.length; i++) {
    const lonGap = i > 0 ? Math.abs(smoothSouth[i][1] - smoothSouth[i-1][1]) : 0
    if (lonGap > 15 && southSeg.length > 1) {
      fillPolygons.push({ south: southSeg, north: northSeg.slice().reverse() })
      southSeg = []; northSeg = []
    }
    southSeg.push(smoothSouth[i])
    northSeg.push(smoothNorth[i] || smoothSouth[i])
  }
  if (southSeg.length > 1) fillPolygons.push({ south: southSeg, north: northSeg.slice().reverse() })

  // Average intensity for fill color
  const avgProb = sorted.length
    ? sorted.reduce((s, p) => s + (p[2] ?? 30), 0) / sorted.length
    : 30
  const fillColor = probToHex(avgProb)

  return (
    <>
      {/* Aurora band fill polygons */}
      {fillPolygons.map((poly, i) => (
        <Polygon
          key={`fill-${i}`}
          positions={[...poly.south, ...poly.north]}
          pathOptions={{
            color: 'none',
            fillColor: fillColor,
            fillOpacity: 1,
            stroke: false,
            smoothFactor: 2,
          }}
        />
      ))}

      {/* Smooth oval boundary */}
      {southSegs.map((seg, i) => (
        <Polyline
          key={`oval-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 2, opacity: 0.9, smoothFactor: 2 }}
        />
      ))}

      {/* Dashed view line */}
      {viewSegs.map((seg, i) => (
        <Polyline
          key={`view-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.4, dashArray: '6 4', smoothFactor: 2 }}
        />
      ))}
    </>
  )
}
