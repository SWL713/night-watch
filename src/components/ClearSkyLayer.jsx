import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// Average cloud cover across all forecast hours for every grid point
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
    grid[ri][ci] = avg / 100  // 0–1 cloud fraction
  }

  return { grid, lats, lons }
}

export default function ClearSkyLayer({ cloudData }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const gridData = useMemo(() => buildAvgGrid(cloudData), [cloudData])

  useEffect(() => {
    if (!gridData) return

    // Create canvas in overlay pane — same as HeatmapLayer
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
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
          const clearFrac = 1 - cf  // 1=totally clear, 0=totally cloudy

          // Moderate penalty: power 1.4 — 70% clear → 61% intensity, 90% → 87%
          const intensity = Math.pow(clearFrac, 1.4)

          // Ramp starts at 25% clear, full strength by 45%
          const ramp = clearFrac < 0.25 ? 0
                     : clearFrac < 0.45 ? (clearFrac - 0.25) / 0.20
                     : 1.0

          if (ramp === 0) continue

          // Teal color: R=20, G=200, B=175
          d[idx]   = 20
          d[idx+1] = 200
          d[idx+2] = 175
          d[idx+3] = Math.round(intensity * 0.70 * edgeFade * ramp * 255)
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
