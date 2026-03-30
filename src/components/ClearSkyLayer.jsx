import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// Bicubic-smooth the binned grid before rendering
// Upsamples to 5x resolution so zone edges have smooth curves
// without blurring the discrete bin values
function upsampleGrid(grid, lats, lons, scale = 5) {
  const rows = lats.length, cols = lons.length
  const newRows = (rows - 1) * scale + 1
  const newCols = (cols - 1) * scale + 1
  const newLats = [], newLons = []
  const spacing = Math.abs(lats[0] - lats[1])
  const newSpacing = spacing / scale

  for (let i = 0; i < newRows; i++) newLats.push(lats[0] - i * newSpacing)
  for (let j = 0; j < newCols; j++) newLons.push(lons[0] + j * newSpacing)

  const newGrid = Array.from({ length: newRows }, () => new Array(newCols).fill(null))

  for (let i = 0; i < newRows; i++) {
    for (let j = 0; j < newCols; j++) {
      const ri = i / scale, ci = j / scale
      const r0 = Math.floor(ri), r1 = Math.min(r0 + 1, rows - 1)
      const c0 = Math.floor(ci), c1 = Math.min(c0 + 1, cols - 1)
      const v00 = grid[r0][c0], v10 = grid[r0][c1]
      const v01 = grid[r1][c0], v11 = grid[r1][c1]
      if (v00 == null && v01 == null && v10 == null && v11 == null) continue
      const tx = ri - r0, ty = ci - c0
      // Smooth step interpolation — creates S-curve transition at bin edges
      // instead of linear which produces jagged stair steps
      const sx = tx * tx * (3 - 2 * tx)
      const sy = ty * ty * (3 - 2 * ty)
      const a = v00 ?? 0, b = v10 ?? 0, c = v01 ?? 0, d = v11 ?? 0
      newGrid[i][j] = a + (b - a) * sy + (c - a) * sx + (a - b - c + d) * sx * sy
    }
  }

  return { grid: newGrid, lats: newLats, lons: newLons }
}

// Bin thresholds for discrete clear sky zones (cloud fraction 0-1)
// Clearness = 1 - cloudFraction
// Bin values are discrete steps — bilinear interpolation between them
// produces smooth organic edges while zone interiors stay flat
const CLEAR_BINS = [
  { maxCloud: 0.20, value: 1.00 },  // excellent: 0-20% cloud
  { maxCloud: 0.45, value: 0.60 },  // good:      21-45% cloud
  { maxCloud: 0.70, value: 0.30 },  // fair:      46-70% cloud
  { maxCloud: 1.00, value: 0.00 },  // cloudy:    71-100% — transparent
]

function snapToBin(cloudFraction) {
  for (const bin of CLEAR_BINS) {
    if (cloudFraction <= bin.maxCloud) return bin.value
  }
  return 0
}

// Average cloud cover across all forecast hours, then snap each point to a bin
function buildAvgGrid(cloudData) {
  if (!cloudData?.points) return null
  const pts = cloudData.points
  const keys = Object.keys(pts)
  if (!keys.length) return null

  const latSet = new Set(), lonSet = new Set()
  for (const k of keys) {
    const [la, lo] = k.split(',').map(parseFloat)
    if (!isNaN(la) && !isNaN(lo)) { latSet.add(la); lonSet.add(lo) }
  }

  const lats = [...latSet].sort((a, b) => b - a)
  const lons = [...lonSet].sort((a, b) => a - b)

  const latIdx = {}, lonIdx = {}
  lats.forEach((v, i) => latIdx[v.toFixed(1)] = i)
  lons.forEach((v, i) => lonIdx[v.toFixed(1)] = i)

  const grid = Array.from({ length: lats.length }, () => new Array(lons.length).fill(null))

  for (const [k, forecasts] of Object.entries(pts)) {
    const [la, lo] = k.split(',').map(parseFloat)
    const ri = latIdx[la.toFixed(1)]
    const ci = lonIdx[lo.toFixed(1)]
    if (ri === undefined || ci === undefined || !forecasts?.length) continue
    const avg = forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
    // Store raw average (0-1) — binning happens at render time after upsampling
    grid[ri][ci] = avg / 100
  }

  return { grid, lats, lons }
}

export default function ClearSkyLayer({ cloudData, getAvgCloudAt }) {
  const map = useMap()
  const canvasRef = useRef(null)

  // Derive bounds from cloudData for edge fade
  const bounds = useMemo(() => {
    if (!cloudData?.points) return null
    const keys = Object.keys(cloudData.points)
    const lats = keys.map(k => parseFloat(k.split(',')[0]))
    const lons  = keys.map(k => parseFloat(k.split(',')[1]))
    return {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLon: Math.min(...lons), maxLon: Math.max(...lons),
    }
  }, [cloudData])

  useEffect(() => {
    if (!getAvgCloudAt || !bounds) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    // Bin thresholds — clearness = 1 - (cf/100), so cf=20% → clearness=0.80
    // Tighter thresholds: only genuinely clear sky gets teal
    const BINS = [
      { minClear: 0.55, maxClear: 0.69, alpha: 45  },  // fair:  31-45% cloud avg
      { minClear: 0.70, maxClear: 0.84, alpha: 95  },  // good:  16-30% cloud avg
      { minClear: 0.85, maxClear: 1.00, alpha: 153 },  // best:  0-15% cloud avg
    ]
    const AA = 0.02  // tight anti-alias band — just enough to remove pixel jaggies

    function redraw() {
      if (!canvasRef.current) return
      const size = map.getSize()
      const dpr  = Math.min(window.devicePixelRatio || 1, 3)
      const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)
      canvas.width = W; canvas.height = H
      canvas.style.width  = size.x + 'px'
      canvas.style.height = size.y + 'px'
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)
      const imageData = ctx.createImageData(W, H)
      const d = imageData.data

      const FADE = 0.8  // degrees of fade at boundary

      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const ll = map.containerPointToLatLng([px / dpr, py / dpr])
          const { lat, lng: lon } = ll

          // Skip outside data bounds
          if (lat < bounds.minLat || lat > bounds.maxLat ||
              lon < bounds.minLon || lon > bounds.maxLon) continue

          // Per-pixel smooth interpolation on 8h average data
          const cf = getAvgCloudAt(lat, lon)
          if (cf === null) continue

          const clearness = 1 - (cf / 100)

          // Edge fade near data boundary
          const edgeDist = Math.min(
            lat - bounds.minLat, bounds.maxLat - lat,
            lon - bounds.minLon, bounds.maxLon - lon
          )
          const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)

          // Find which bin and anti-alias at boundaries
          let alpha = 0
          for (let b = 0; b < BINS.length; b++) {
            const bin = BINS[b]
            if (clearness < bin.minClear - AA) continue
            if (clearness > bin.maxClear) { alpha = bin.alpha; continue }

            const prev = b > 0 ? BINS[b-1].alpha : 0

            if (clearness < bin.minClear + AA) {
              // Anti-alias at lower bin edge
              const t = (clearness - (bin.minClear - AA)) / (2 * AA)
              const s = t * t * (3 - 2 * t)  // smooth step
              alpha = Math.round(prev + (bin.alpha - prev) * s)
            } else {
              alpha = bin.alpha
            }
          }

          if (alpha === 0) continue

          const idx = (py * W + px) * 4
          d[idx]   = 0
          d[idx+1] = 210
          d[idx+2] = 160
          d[idx+3] = Math.round(alpha * edgeFade)
        }
      }
      ctx.putImageData(imageData, 0, 0)
    }

    redraw()
    map.on('moveend zoomend resize', redraw)

    return () => {
      map.off('moveend zoomend resize', redraw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [map, getAvgCloudAt, bounds])

  return null
}

// Exported for SpotPins to get 8h avg cloud at a specific location
export function getAvgCloudForSpot(cloudData, lat, lon) {
  if (!cloudData?.points) return null
  const spacing = cloudData.spacing || 0.1
  // Try exact snap first, then try nearby keys
  const la0 = parseFloat((Math.round(lat / spacing) * spacing).toFixed(1))
  const lo0 = parseFloat((Math.round(lon / spacing) * spacing).toFixed(1))
  const key = `${la0.toFixed(1)},${lo0.toFixed(1)}`
  const forecasts = cloudData.points[key]
  if (!forecasts?.length) return null
  return forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
}
