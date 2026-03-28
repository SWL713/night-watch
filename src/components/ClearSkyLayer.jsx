import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// Builds a pre-averaged grid from cloud data points
// Returns { grid, lats, lons } averaged across all forecast hours
function buildAvgGrid(cloudData) {
  if (!cloudData?.points) return null

  const pts = cloudData.points
  const keys = Object.keys(pts)
  if (!keys.length) return null

  // Parse all lat/lon keys
  const latSet = new Set(), lonSet = new Set()
  for (const k of keys) {
    const [la, lo] = k.split(',').map(parseFloat)
    if (!isNaN(la) && !isNaN(lo)) { latSet.add(la); lonSet.add(lo) }
  }

  const lats = [...latSet].sort((a, b) => b - a)  // descending
  const lons = [...lonSet].sort((a, b) => a - b)  // ascending

  // Build averaged grid
  const latIdx = {}, lonIdx = {}
  lats.forEach((v, i) => latIdx[v.toFixed(1)] = i)
  lons.forEach((v, i) => lonIdx[v.toFixed(1)] = i)

  const grid = Array.from({ length: lats.length }, () => new Array(lons.length).fill(null))

  for (const [k, forecasts] of Object.entries(pts)) {
    const [la, lo] = k.split(',').map(parseFloat)
    const ri = latIdx[la.toFixed(1)]
    const ci = lonIdx[lo.toFixed(1)]
    if (ri === undefined || ci === undefined) continue
    if (!forecasts?.length) continue
    // Average all hours — this is the 8h average cloud fraction
    const avg = forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
    grid[ri][ci] = avg / 100  // 0-1
  }

  return { grid, lats, lons }
}

// Leaflet canvas layer — redraws on map move/zoom
const ClearSkyCanvas = L.Class.extend({
  initialize(gridData) { this._gridData = gridData },

  addTo(map) {
    this._map = map
    this._canvas = document.createElement('canvas')
    this._canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
    map.getPanes().overlayPane.appendChild(this._canvas)
    map.on('moveend zoomend resize', this._redraw, this)
    this._redraw()
    return this
  },

  remove() {
    if (!this._map) return
    this._map.off('moveend zoomend resize', this._redraw, this)
    this._canvas?.remove()
    this._map = null
  },

  _redraw() {
    const map = this._map
    if (!map || !this._gridData) return
    const canvas = this._canvas
    const size = map.getSize()
    const dpr  = Math.min(window.devicePixelRatio || 1, 3)
    const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)
    canvas.width = W; canvas.height = H
    canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px'
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    const { grid, lats, lons } = this._gridData
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
        cf = Math.max(0, Math.min(1, cf))

        // Edge fade
        const rawFade = Math.max(0, Math.min(1,
          Math.min(ll.lat - lats[rows-1], latMax - ll.lat,
                   ll.lng - lonMin, lons[cols-1] - ll.lng) / FADE))
        const edgeFade = Math.pow(rawFade, 0.4)

        const idx = (py * W + px) * 4

        // clearFraction: 1 = totally clear, 0 = totally cloudy
        const clearFrac = 1 - cf

        // Only show teal where clear fraction is meaningful (> 40% clear avg)
        if (clearFrac < 0.40) continue
        // Power curve — punishes partial cloud heavily, rewards clear sky strongly
        const penalty = Math.pow(clearFrac, 2.5)
        const ramp = clearFrac < 0.60 ? (clearFrac - 0.40) / 0.20 : 1.0

        // Teal: R=30, G=210, B=180
        const alpha = Math.round(penalty * 0.65 * edgeFade * ramp * 255)
        d[idx]   = 30
        d[idx+1] = 210
        d[idx+2] = 180
        d[idx+3] = alpha
      }
    }
    ctx.putImageData(imageData, 0, 0)
  },
})

export default function ClearSkyLayer({ cloudData }) {
  const map = useMap()
  const layerRef = useRef(null)

  const gridData = useMemo(() => buildAvgGrid(cloudData), [cloudData])

  useEffect(() => {
    if (!gridData) return
    const layer = new ClearSkyCanvas(gridData)
    layer.addTo(map)
    layerRef.current = layer
    return () => { layer.remove(); layerRef.current = null }
  }, [map, gridData])

  return null
}

// Export the helper so SpotPins can use it for cloud-averaged pin colors
export function getAvgCloudForSpot(cloudData, lat, lon) {
  if (!cloudData?.points) return null
  const spacing = cloudData.spacing || 0.1
  const la0 = parseFloat((Math.round(lat / spacing) * spacing).toFixed(1))
  const lo0 = parseFloat((Math.round(lon / spacing) * spacing).toFixed(1))
  const key = `${la0.toFixed(1)},${lo0.toFixed(1)}`
  const forecasts = cloudData.points[key]
  if (!forecasts?.length) return null
  return forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
}
