import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, cloudScore, bortleScore } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'

const GRID_SPACING = 1.0

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
  // Green → Yellow → Orange → Red
  if (score >= 0.70) return [34, 197, 94]
  if (score >= 0.50) return [134, 197, 34]
  if (score >= 0.35) return [234, 179, 8]
  if (score >= 0.20) return [249, 115, 22]
  return [239, 68, 68]
}

// Build score grid from data
function buildScoreGrid(mode, getCloudAt, selectedHour) {
  const grid = []
  for (let lat = GRID_BOUNDS.maxLat; lat >= GRID_BOUNDS.minLat; lat -= GRID_SPACING) {
    const row = []
    for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += GRID_SPACING) {
      const gLat = parseFloat(lat.toFixed(1))
      const gLon = parseFloat(lon.toFixed(1))
      const cloud = getCloudAt ? getCloudAt(gLat, gLon, selectedHour) : 50
      const bortle = interpolateBortle(gLat, gLon)
      let score
      if (mode === 'clouds') score = 1 - cloud / 100
      else if (mode === 'bortle') score = bortleScore(bortle)
      else score = combinedScore(cloud, bortle)
      row.push(score)
    }
    grid.push(row)
  }
  return grid
}

// Custom Leaflet layer using canvas with bilinear interpolation
const SmoothHeatmap = L.Layer.extend({
  initialize(options) {
    this._options = options
  },

  onAdd(map) {
    this._map = map
    this._canvas = document.createElement('canvas')
    this._canvas.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'z-index:200',
      'opacity:0.72',
    ].join(';')
    map.getPanes().overlayPane.appendChild(this._canvas)
    map.on('moveend zoomend resize', this._redraw, this)
    this._redraw()
  },

  onRemove(map) {
    this._canvas.remove()
    map.off('moveend zoomend resize', this._redraw, this)
  },

  updateData(scoreGrid, mode) {
    this._scoreGrid = scoreGrid
    this._mode = mode
    this._redraw()
  },

  _redraw() {
    if (!this._map || !this._scoreGrid) return
    const map = this._map
    const canvas = this._canvas
    const size = map.getSize()
    canvas.width = size.x
    canvas.height = size.y

    // Position canvas at top-left of map container
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const grid = this._scoreGrid
    const rows = grid.length
    const cols = grid[0].length

    // Map each grid cell to pixel coordinates and draw filled quads
    const latStep = (GRID_BOUNDS.maxLat - GRID_BOUNDS.minLat) / (rows - 1)
    const lonStep = (GRID_BOUNDS.maxLon - GRID_BOUNDS.minLon) / (cols - 1)

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const lat1 = GRID_BOUNDS.maxLat - r * latStep
        const lat2 = GRID_BOUNDS.maxLat - (r + 1) * latStep
        const lon1 = GRID_BOUNDS.minLon + c * lonStep
        const lon2 = GRID_BOUNDS.minLon + (c + 1) * lonStep

        const p1 = map.latLngToContainerPoint([lat1, lon1])
        const p2 = map.latLngToContainerPoint([lat2, lon2])

        // Average the 4 corner scores for smooth blending
        const s = (grid[r][c] + grid[r][c+1] + grid[r+1][c] + grid[r+1][c+1]) / 4
        const [red, green, blue] = scoreToRGB(s)

        ctx.fillStyle = `rgba(${red},${green},${blue},0.55)`
        ctx.fillRect(
          Math.floor(p1.x), Math.floor(p1.y),
          Math.ceil(p2.x - p1.x), Math.ceil(p2.y - p1.y)
        )
      }
    }

    // Smooth with a slight blur for gradients between cells
    ctx.filter = 'blur(18px)'
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Re-draw with blur applied via shadow instead (canvas filter is two-pass)
    ctx.filter = 'none'
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const lat1 = GRID_BOUNDS.maxLat - r * latStep
        const lat2 = GRID_BOUNDS.maxLat - (r + 1) * latStep
        const lon1 = GRID_BOUNDS.minLon + c * lonStep
        const lon2 = GRID_BOUNDS.minLon + (c + 1) * lonStep

        const p1 = map.latLngToContainerPoint([lat1, lon1])
        const p2 = map.latLngToContainerPoint([lat2, lon2])

        const s = (grid[r][c] + grid[r][c+1] + grid[r+1][c] + grid[r+1][c+1]) / 4
        const [red, green, blue] = scoreToRGB(s)

        // Use shadow blur for smooth edges between cells
        const pw = Math.ceil(p2.x - p1.x)
        const ph = Math.ceil(p2.y - p1.y)
        ctx.shadowColor = `rgba(${red},${green},${blue},0.4)`
        ctx.shadowBlur = Math.max(pw, ph) * 0.8
        ctx.fillStyle = `rgba(${red},${green},${blue},0.45)`
        ctx.fillRect(Math.floor(p1.x), Math.floor(p1.y), pw + 1, ph + 1)
      }
    }
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
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
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map])

  useEffect(() => {
    if (!layerRef.current || cloudLoading) return
    const grid = buildScoreGrid(mode, getCloudAt, selectedHour)
    layerRef.current.updateData(grid, mode)
  }, [mode, selectedHour, getCloudAt, cloudLoading])

  return null
}
