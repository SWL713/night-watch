import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, cloudScore, bortleScore } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { GRID_SPACING } from '../hooks/useCloudCover.js'

const BORTLE_ANCHOR = [
  [40.71, -74.01, 9], [42.36, -71.06, 8], [42.65, -73.75, 7],
  [43.05, -76.15, 7], [43.16, -77.61, 7], [42.89, -78.88, 8],
  [42.33, -83.05, 8], [45.42, -75.70, 7], [43.70, -79.42, 8],
  [45.50, -73.57, 8], [41.82, -71.42, 7], [41.31, -72.93, 7],
  [39.95, -75.17, 8], [44.20, -74.30, 2], [43.97, -74.14, 3],
  [44.10, -74.52, 2], [44.29, -74.18, 3], [43.64, -73.50, 3],
  [43.80, -73.38, 3], [43.78, -74.26, 2], [46.50, -77.00, 2],
  [47.00, -71.00, 2], [45.00, -76.00, 3], [44.80, -63.10, 3],
  [46.00, -64.00, 3],
]

function interpolateBortle(lat, lon) {
  let wSum = 0, vSum = 0
  for (const [alat, alon, b] of BORTLE_ANCHOR) {
    const d = Math.sqrt((lat - alat) ** 2 + (lon - alon) ** 2)
    if (d < 0.01) return b
    const w = 1 / (d * d)
    wSum += w; vSum += w * b
  }
  return Math.max(1, Math.min(9, vSum / wSum))
}

function scoreToRGB(score) {
  if (score >= 0.70) return [34, 197, 94]
  if (score >= 0.50) return [134, 197, 34]
  if (score >= 0.35) return [234, 179, 8]
  if (score >= 0.20) return [249, 115, 22]
  return [239, 68, 68]
}

// Bilinear interpolation between 4 corner scores
function bilinear(s00, s10, s01, s11, tx, ty) {
  const top = s00 + (s10 - s00) * tx
  const bot = s01 + (s11 - s01) * tx
  return top + (bot - top) * ty
}

function buildScoreGrid(mode, getCloudAt, selectedHour) {
  const lats = []
  const lons = []
  for (let lat = GRID_BOUNDS.maxLat; lat >= GRID_BOUNDS.minLat - 0.01; lat -= GRID_SPACING) {
    lats.push(parseFloat(lat.toFixed(2)))
  }
  for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon + 0.01; lon += GRID_SPACING) {
    lons.push(parseFloat(lon.toFixed(2)))
  }

  const grid = lats.map(lat =>
    lons.map(lon => {
      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : 50
      const bortle = interpolateBortle(lat, lon)
      if (mode === 'clouds') return 1 - cloud / 100
      if (mode === 'bortle') return bortleScore(bortle)
      return combinedScore(cloud, bortle)
    })
  )
  return { grid, lats, lons }
}

const SmoothHeatmap = L.Layer.extend({
  initialize(options) { this._options = options },

  onAdd(map) {
    this._map = map
    this._canvas = document.createElement('canvas')
    this._canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:200;'
    map.getPanes().overlayPane.appendChild(this._canvas)
    map.on('moveend zoomend resize', this._redraw, this)
    this._redraw()
  },

  onRemove(map) {
    this._canvas.remove()
    map.off('moveend zoomend resize', this._redraw, this)
  },

  updateData(scoreData, mode) {
    this._scoreData = scoreData
    this._mode = mode
    this._redraw()
  },

  _redraw() {
    if (!this._map || !this._scoreData) return
    const map = this._map
    const canvas = this._canvas
    const size = map.getSize()
    canvas.width  = size.x
    canvas.height = size.y
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, size.x, size.y)

    const { grid, lats, lons } = this._scoreData
    const rows = lats.length
    const cols = lons.length

    // Render pixel-by-pixel using bilinear interpolation for smooth gradient
    // Sample every 2px for performance
    const STEP = 2
    const imageData = ctx.createImageData(size.x, size.y)
    const data = imageData.data

    for (let py = 0; py < size.y; py += STEP) {
      for (let px = 0; px < size.x; px += STEP) {
        // Pixel → LatLng
        const latlng = map.containerPointToLatLng([px, py])
        const lat = latlng.lat
        const lon = latlng.lng

        // Find grid cell
        const ci = (GRID_BOUNDS.maxLat - lat) / GRID_SPACING
        const cj = (lon - GRID_BOUNDS.minLon) / GRID_SPACING
        const r0 = Math.floor(ci), r1 = r0 + 1
        const c0 = Math.floor(cj), c1 = c0 + 1

        if (r0 < 0 || r1 >= rows || c0 < 0 || c1 >= cols) continue

        const tx = cj - c0
        const ty = ci - r0
        const score = bilinear(
          grid[r0][c0], grid[r0][c1],
          grid[r1][c0], grid[r1][c1],
          tx, ty
        )

        const [red, green, blue] = scoreToRGB(score)
        const alpha = Math.round(0.55 * 255)

        // Fill STEP×STEP block
        for (let dy = 0; dy < STEP && py + dy < size.y; dy++) {
          for (let dx = 0; dx < STEP && px + dx < size.x; dx++) {
            const idx = ((py + dy) * size.x + (px + dx)) * 4
            data[idx]     = red
            data[idx + 1] = green
            data[idx + 2] = blue
            data[idx + 3] = alpha
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)

    // Single gaussian blur pass for smooth final result
    ctx.filter = 'blur(6px)'
    const tmp = document.createElement('canvas')
    tmp.width = size.x; tmp.height = size.y
    tmp.getContext('2d').drawImage(canvas, 0, 0)
    ctx.filter = 'none'
    ctx.clearRect(0, 0, size.x, size.y)
    ctx.drawImage(tmp, 0, 0)
  },
})

export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    const layer = new SmoothHeatmap({})
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    }
  }, [map])

  useEffect(() => {
    if (!layerRef.current || cloudLoading) return
    const scoreData = buildScoreGrid(mode, getCloudAt, selectedHour)
    layerRef.current.updateData(scoreData, mode)
  }, [mode, selectedHour, getCloudAt, cloudLoading])

  return null
}
