import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, bortleScore, scoreToRGB } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

const CLOUD_SPACING = 0.25

// Gentle separable gaussian — smooths DATA not pixels, preserves real detail
// Radius 2, sigma 1.2 — softens hard cell edges without destroying structure
function gaussianSmooth(grid, rows, cols) {
  const sigma = 1.2, R = 2
  const raw = []
  let ksum = 0
  for (let i = -R; i <= R; i++) {
    const v = Math.exp(-i * i / (2 * sigma * sigma))
    raw.push(v); ksum += v
  }
  const k = raw.map(v => v / ksum)

  // Horizontal pass
  const tmp = Array.from({ length: rows }, () => new Float32Array(cols))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0
      for (let i = -R; i <= R; i++) {
        s += grid[r][Math.max(0, Math.min(cols - 1, c + i))] * k[i + R]
      }
      tmp[r][c] = s
    }
  }
  // Vertical pass
  const out = Array.from({ length: rows }, () => new Float32Array(cols))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0
      for (let i = -R; i <= R; i++) {
        s += tmp[Math.max(0, Math.min(rows - 1, r + i))][c] * k[i + R]
      }
      out[r][c] = s
    }
  }
  return out
}

function buildScoreGrid(mode, getCloudAt, selectedHour, bortleGrid) {
  const pad = CLOUD_SPACING * 2
  const lats = [], lons = []
  for (let lat = GRID_BOUNDS.maxLat + pad; lat >= GRID_BOUNDS.minLat - pad - 0.001; lat -= CLOUD_SPACING)
    lats.push(parseFloat(lat.toFixed(2)))
  for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.001; lon += CLOUD_SPACING)
    lons.push(parseFloat(lon.toFixed(2)))

  const raw = lats.map(lat =>
    lons.map(lon => {
      const bortle = bortleGrid ? getBortle(bortleGrid, lat, lon) : 5
      if (mode === 'bortle') return bortleScore(bortle)
      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
      if (mode === 'clouds') return cloud !== null ? 1 - cloud / 100 : bortleScore(bortle) * 0.7
      if (cloud === null) return bortleScore(bortle) * 0.7
      return combinedScore(cloud, bortle)
    })
  )

  // Smooth the score data — this removes cell seams without blurring pixels
  const grid = gaussianSmooth(raw, lats.length, lons.length)
  return { grid, lats, lons }
}

function bilinear(s00, s10, s01, s11, tx, ty) {
  return s00 + (s10 - s00) * tx + (s01 - s00) * ty + (s00 - s10 - s01 + s11) * tx * ty
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

  updateData(scoreData) {
    this._scoreData = scoreData
    this._redraw()
  },

  _redraw() {
    if (!this._map || !this._scoreData) return
    const map    = this._map
    const canvas = this._canvas
    const size   = map.getSize()
    const dpr    = Math.min(window.devicePixelRatio || 1, 3)

    const W = Math.round(size.x * dpr)
    const H = Math.round(size.y * dpr)
    canvas.width  = W
    canvas.height = H
    canvas.style.width  = size.x + 'px'
    canvas.style.height = size.y + 'px'
    canvas.style.filter = 'none'
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    const { grid, lats, lons } = this._scoreData
    const rows   = lats.length
    const cols   = lons.length
    if (rows < 2 || cols < 2) return

    const latMax = lats[0]
    const lonMin = lons[0]
    const FADE   = CLOUD_SPACING * 5

    const imageData = ctx.createImageData(W, H)
    const data      = imageData.data

    // Render every physical pixel — bilinear interpolation on pre-smoothed data
    // No post-blur needed: data smoothing handles gradients, bilinear handles sub-cell
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const latlng = map.containerPointToLatLng([px / dpr, py / dpr])
        const lat    = latlng.lat
        const lon    = latlng.lng

        const ci = (latMax - lat) / CLOUD_SPACING
        const cj = (lon - lonMin) / CLOUD_SPACING
        const r0 = Math.floor(ci), r1 = r0 + 1
        const c0 = Math.floor(cj), c1 = c0 + 1

        if (r0 < 0 || r1 >= rows || c0 < 0 || c1 >= cols) continue

        const score = bilinear(
          grid[r0][c0], grid[r0][c1],
          grid[r1][c0], grid[r1][c1],
          cj - c0, ci - r0
        )

        const [red, green, blue] = scoreToRGB(Math.max(0, Math.min(1, score)))

        const distFromEdge = Math.min(
          lat - lats[rows - 1], latMax - lat,
          lon - lonMin, lons[cols - 1] - lon
        )
        const edgeFade = Math.max(0, Math.min(1, distFromEdge / FADE))
        const alpha    = Math.round(0.45 * edgeFade * 255)

        const idx = (py * W + px) * 4
        data[idx]     = red
        data[idx + 1] = green
        data[idx + 2] = blue
        data[idx + 3] = alpha
      }
    }

    ctx.putImageData(imageData, 0, 0)
  },
})

export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map      = useMap()
  const layerRef = useRef(null)
  const [bortleGrid, setBortleGrid] = useState(null)

  useEffect(() => {
    loadBortleGrid().then(g => { if (g) setBortleGrid(g) })
  }, [])

  useEffect(() => {
    const layer = new SmoothHeatmap({})
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    }
  }, [map])

  useEffect(() => {
    if (!layerRef.current || !bortleGrid) return
    const scoreData = buildScoreGrid(mode, getCloudAt, selectedHour, bortleGrid)
    layerRef.current.updateData(scoreData)
  }, [mode, selectedHour, getCloudAt, cloudLoading, bortleGrid])

  useEffect(() => {
    if (!layerRef.current || !bortleGrid || !getCloudAt) return
    const scoreData = buildScoreGrid(mode, getCloudAt, selectedHour, bortleGrid)
    layerRef.current.updateData(scoreData)
  }, [selectedHour]) // eslint-disable-line

  return null
}
