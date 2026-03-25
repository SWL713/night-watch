import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, bortleScore, scoreToRGB } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

// Approximate eastern coastline — points east of this are Atlantic Ocean
const COAST_MASK = {
  38.0: -74.5, 38.5: -74.2, 39.0: -74.0, 39.5: -73.8,
  40.0: -73.5, 40.5: -73.0, 41.0: -71.8, 41.5: -71.2,
  42.0: -69.9, 42.5: -70.0, 43.0: -70.5, 43.5: -70.2,
  44.0: -69.2, 44.5: -67.5, 45.0: -67.0, 45.5: -67.0,
  46.0: -67.5, 46.5: -68.0, 47.0: -68.5, 47.5: -69.0,
  48.0: -69.5,
}
const COAST_LATS = Object.keys(COAST_MASK).map(Number).sort((a,b) => a-b)
function maxLonForLat(lat) {
  for (const cl of COAST_LATS) {
    if (lat <= cl) return COAST_MASK[cl]
  }
  return GRID_BOUNDS.maxLon
}
function isOcean(lat, lon) { return lon > maxLonForLat(lat) }

const CLOUD_SPACING  = 0.25
const BORTLE_SPACING = 0.1

// Gentle separable gaussian — smooths score grid to remove cell seams.
// With HRRR data (3km native, resampled to 0.25°) the source data is already
// spatially coherent so we use a moderate kernel.
// Radius 2, sigma 1.0 — creates gradual transitions without destroying real boundaries.
function gaussianSmooth(grid, rows, cols, sigma = 1.0, R = 2) {
  const raw = []
  let ksum = 0
  for (let i = -R; i <= R; i++) {
    const v = Math.exp(-i * i / (2 * sigma * sigma))
    raw.push(v); ksum += v
  }
  const k = raw.map(v => v / ksum)

  // Horizontal pass — null cells (ocean) stay null, never filled from neighbours
  const tmp = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] == null) continue  // ocean — preserve null
      let s = 0, w = 0
      for (let i = -R; i <= R; i++) {
        const v = grid[r][Math.max(0, Math.min(cols - 1, c + i))]
        if (v != null) { s += v * k[i + R]; w += k[i + R] }
      }
      tmp[r][c] = w > 0 ? s / w : null
    }
  }
  // Vertical pass
  const out = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tmp[r][c] == null) continue  // ocean — preserve null
      let s = 0, w = 0
      for (let i = -R; i <= R; i++) {
        const v = tmp[Math.max(0, Math.min(rows - 1, r + i))][c]
        if (v != null) { s += v * k[i + R]; w += k[i + R] }
      }
      out[r][c] = w > 0 ? s / w : null
    }
  }
  return out
}

function buildScoreGrid(mode, getCloudAt, selectedHour, bortleLookup) {
  const spacing = mode === 'bortle' ? BORTLE_SPACING : CLOUD_SPACING
  const pad = spacing * 2
  const lats = [], lons = []
  for (let lat = GRID_BOUNDS.maxLat + pad; lat >= GRID_BOUNDS.minLat - pad - 0.001; lat -= spacing)
    lats.push(parseFloat(lat.toFixed(2)))
  for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.001; lon += spacing)
    lons.push(parseFloat(lon.toFixed(2)))

  const raw = lats.map(lat =>
    lons.map(lon => {
      if (isOcean(lat, lon)) return null
      const bortle = bortleLookup ? getBortle(bortleLookup, lat, lon) : 5
      const bScore = bortleScore(bortle)

      if (mode === 'bortle') return bScore

      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
      const adjusted = cloud === null ? null : cloud  // no threshold — full range
      const cScore = adjusted === null ? null : 1 - adjusted / 100

      if (mode === 'clouds') return cScore

      // Combined: pure multiply — cloud is ceiling, bortle is floor penalty
      // Clear dark sky = green. Clouds pull everything toward red.
      // Bortle can't lift cloudy areas — only clear sky reveals dark sky quality.
      if (cScore === null) return bScore  // no cloud data — show bortle
      if (cScore <= 0) return 0           // 100% cloud = hard red always
      return cScore * bScore
    })
  )

  // No gaussian pre-smooth for clouds/combined — bilinear interpolation at
  // render time naturally smooths between 0.25° grid cells without creating
  // the flat plateaus that cause visible block edges
  // Bortle still gets gentle smooth since it's at 0.1° native resolution
  const smoothSigma = mode === 'bortle' ? 1.0 : 0
  const smoothR     = mode === 'bortle' ? 2   : 0
  const grid = smoothR > 0
    ? gaussianSmooth(raw, lats.length, lons.length, smoothSigma, smoothR)
    : raw
  return { grid, lats, lons, mode }
}

function cubicKernel(t) {
  const a = -0.5  // Catmull-Rom
  const at = Math.abs(t)
  if (at <= 1) return (a + 2) * at * at * at - (a + 3) * at * at + 1
  if (at < 2)  return a * at * at * at - 5 * a * at * at + 8 * a * at - 4 * a
  return 0
}

function bicubicSample(grid, rows, cols, ci, cj) {
  const r = Math.floor(ci)
  const c = Math.floor(cj)
  const dr = ci - r
  const dc = cj - c

  let value = 0, weight = 0
  for (let m = -1; m <= 2; m++) {
    for (let n = -1; n <= 2; n++) {
      const rr = Math.max(0, Math.min(rows - 1, r + m))
      const cc = Math.max(0, Math.min(cols - 1, c + n))
      const v  = grid[rr][cc]
      if (v == null) continue
      const w = cubicKernel(m - dr) * cubicKernel(n - dc)
      value += v * w
      weight += w
    }
  }
  return weight > 0 ? Math.max(0, Math.min(1, value / weight)) : null
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

    const latMax  = lats[0]
    const lonMin  = lons[0]
    const spacing = lats.length > 1 ? Math.abs(lats[0] - lats[1]) : CLOUD_SPACING
    const FADE    = spacing * 5

    // Helper: bilinear sample a grid at fractional cell coords, returns null if no data
    function sampleGrid(g, ci, cj, r0, r1, c0, c1) {
      const s00 = g[r0][c0], s10 = g[r0][c1]
      const s01 = g[r1][c0], s11 = g[r1][c1]
      const vals = [s00, s10, s01, s11].filter(v => v != null)
      if (vals.length === 0) return null
      if (vals.length === 4) return bilinear(s00, s10, s01, s11, cj - c0, ci - r0)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    const imageData = ctx.createImageData(W, H)
    const data      = imageData.data

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const latlng = map.containerPointToLatLng([px / dpr, py / dpr])
        const lat    = latlng.lat
        const lon    = latlng.lng

        const ci = (latMax - lat) / spacing
        const cj = (lon - lonMin) / spacing
        const r0 = Math.floor(ci), r1 = r0 + 1
        const c0 = Math.floor(cj), c1 = c0 + 1

        if (r0 < 0 || r1 >= rows || c0 < 0 || c1 >= cols) continue

        const score = sampleGrid(grid, ci, cj, r0, r1, c0, c1)
        if (score === null) continue

        const distFromEdge = Math.min(
          lat - lats[rows - 1], latMax - lat,
          lon - lonMin, lons[cols - 1] - lon
        )
        const edgeFade = Math.max(0, Math.min(1, distFromEdge / FADE))

        const [red, green, blue] = scoreToRGB(Math.max(0, Math.min(1, score)))
        const idx = (py * W + px) * 4
        data[idx]     = red
        data[idx + 1] = green
        data[idx + 2] = blue
        data[idx + 3] = Math.round(0.45 * edgeFade * 255)
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
