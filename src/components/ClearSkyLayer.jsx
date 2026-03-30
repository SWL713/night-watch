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
    // Snap to bin value — discrete steps create hard zone edges
    grid[ri][ci] = snapToBin(avg / 100)
  }

  return { grid, lats, lons }
}

export default function ClearSkyLayer({ cloudData }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const gridData = useMemo(() => {
    const raw = buildAvgGrid(cloudData)
    if (!raw) return null
    return upsampleGrid(raw.grid, raw.lats, raw.lons, 5)
  }, [cloudData])

  useEffect(() => {
    if (!gridData) return

    // Create canvas in overlay pane — same as HeatmapLayer
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;filter:blur(4px);'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    function redraw() {
      if (!canvasRef.current) return
      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)
      canvas.width = W; canvas.height = H
      canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px'
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)

      const { grid, lats, lons } = gridData
      const rows = lats.length, cols = lons.length
      if (rows < 2 || cols < 2) return

      const latMax  = lats[0], lonMin = lons[0]
      const spacing = Math.abs(lats[0] - lats[1])
      const FADE    = spacing * 8
      const imageData = ctx.createImageData(W, H)
      const d = imageData.data

      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const ll = map.containerPointToLatLng([px / dpr, py / dpr])
          const ci = (latMax - ll.lat) / spacing
          const cj = (ll.lng - lonMin) / spacing
          const r0 = Math.floor(ci), r1 = r0 + 1
          const c0 = Math.floor(cj), c1 = c0 + 1
          if (r0 < 0 || r1 >= rows || c0 < 0 || c1 >= cols) continue

          const s00 = grid[r0][c0], s10 = grid[r0][c1]
          const s01 = grid[r1][c0], s11 = grid[r1][c1]
          const vals = [s00,s10,s01,s11].filter(v => v != null)
          if (!vals.length) continue

          const tx = cj - c0, ty = ci - r0
          let cf = vals.length === 4
            ? s00 + (s10-s00)*tx + (s01-s00)*ty + (s00-s10-s01+s11)*tx*ty
            : vals.reduce((a,b) => a+b, 0) / vals.length
          cf = Math.max(0, Math.min(1, cf))  // 0=clear, 1=cloudy

          // Edge fade
          const rawFade = Math.max(0, Math.min(1,
            Math.min(ll.lat - lats[rows-1], latMax - ll.lat,
                     ll.lng - lonMin, lons[cols-1] - ll.lng) / FADE))
          const edgeFade = Math.pow(rawFade, 0.4)

          const idx = (py * W + px) * 4

          // cf is now a bin value: 1.0=excellent, 0.6=good, 0.3=fair, 0=cloudy
          // Bilinear interpolation between bin values gives smooth organic edges
          // while zone interiors stay flat at their bin value
          if (cf <= 0) continue  // cloudy — transparent

          // Map bin values to teal alpha levels
          // 1.00 = 153 (60% — matches sky brightness max)
          // 0.60 = 95
          // 0.30 = 45
          const alpha = cf >= 0.95 ? 153
                      : cf >= 0.55 ? 95
                      : cf >= 0.25 ? 45
                      : 0

          if (alpha === 0) continue

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
  }, [map, gridData])

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
