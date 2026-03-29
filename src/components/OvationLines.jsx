import { Polyline } from 'react-leaflet'

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
      const lat = a[0] + (b[0] - a[0]) * tc
      const lon = a[1] + (b[1] - a[1]) * tc
      if (!isNaN(lat) && !isNaN(lon)) out.push([lat, lon])
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

  // Filter out any points with NaN coordinates
  const sorted = [...oval].filter(p => !isNaN(p[0]) && !isNaN(p[1])).sort((a, b) => a[1] - b[1])
  const boundaryPts = sorted.map(p => [p[0], p[1]])
  const smoothBoundary = smoothPoints(boundaryPts)
  const boundarySegs = splitAtGaps(smoothBoundary)

  const sortedView = [...viewLine].filter(p => !isNaN(p[0]) && !isNaN(p[1])).sort((a, b) => a[1] - b[1])
  const smoothView = smoothPoints(sortedView)
  const viewSegs = splitAtGaps(smoothView)

  return (
    <>
      {boundarySegs.map((seg, i) => (
        <Polyline
          key={`oval-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 2, opacity: 0.9, smoothFactor: 2 }}
        />
      ))}
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
