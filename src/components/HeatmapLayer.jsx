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

  // Horizontal pass
  const tmp = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Collect neighbour values — use available values only, skip nulls
      let s = 0, w = 0
      for (let i = -R; i <= R; i++) {
        const v = grid[r][Math.max(0, Math.min(cols - 1, c + i))]
        if (v != null) { s += v * k[i + R]; w += k[i + R] }
      }
      tmp[r][c] = w > 0 ? s / w : null  // null only if ALL neighbours are null
    }
  }
  // Vertical pass
  const out = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
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
  // Bortle base always at 0.1° full resolution
  // Cloud overlay built separately at 0.25° (matching pipeline data resolution)
  const bSpacing = BORTLE_SPACING
  const cSpacing = CLOUD_SPACING
  const spacing  = mode === 'clouds' ? cSpacing : bSpacing
  const pad      = spacing * 2

  const lats = [], lons = []
  for (let lat = GRID_BOUNDS.maxLat + pad; lat >= GRID_BOUNDS.minLat - pad - 0.001; lat -= spacing)
    lats.push(parseFloat(lat.toFixed(2)))
  for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.001; lon += spacing)
    lons.push(parseFloat(lon.toFixed(2)))

  // Base grid: bortle score (or cloud score for clouds-only mode)
  const raw = lats.map(lat =>
    lons.map(lon => {
      if (isOcean(lat, lon)) return null
      const bortle = bortleLookup ? getBortle(bortleLookup, lat, lon) : 5
      if (mode === 'bortle' || mode === 'combined') return bortleScore(bortle)
      // Clouds-only
      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
      if (cloud === null) return null
      const adjusted = cloud < 40 ? 0 : (cloud - 40) / 60 * 100
      return 1 - adjusted / 100
    })
  )

  // Cloud overlay grid for combined mode — built at CLOUD_SPACING (0.25°)
  // Separate lats/lons so it doesn't inherit bortle's 0.1° resolution
  let cloudGrid = null
  if (mode === 'combined') {
    const cPad  = cSpacing * 2
    const cLats = [], cLons = []
    for (let lat = GRID_BOUNDS.maxLat + cPad; lat >= GRID_BOUNDS.minLat - cPad - 0.001; lat -= cSpacing)
      cLats.push(parseFloat(lat.toFixed(2)))
    for (let lon = GRID_BOUNDS.minLon - cPad; lon <= GRID_BOUNDS.maxLon + cPad + 0.001; lon += cSpacing)
      cLons.push(parseFloat(lon.toFixed(2)))

    const cloudRaw = cLats.map(lat =>
      cLons.map(lon => {
        if (isOcean(lat, lon)) return null
        const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
        if (cloud === null) return 0
        return cloud < 40 ? 0 : (cloud - 40) / 60
      })
    )
    // No gaussian pre-smoothing — bicubic interpolation at render time handles
    // smooth transitions between cells without smearing the underlying data
    cloudGrid = { grid: cloudRaw, lats: cLats, lons: cLons }
  }

  const grid = gaussianSmooth(raw, lats.length, lons.length)
  return { grid, lats, lons, cloudGrid, mode }
}

// Bicubic interpolation kernel (Catmull-Rom)
// Continuous first derivatives = no visible grid-cell boundaries
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

    const { grid, lats, lons, cloudGrid: cGrid, mode: renderMode } = this._scoreData
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

        const idx = (py * W + px) * 4

        if (renderMode === 'combined' && cGrid) {
          // ── Combined: bortle base + cloud red overlay at fixed 50% alpha ──
          // Both layers bilinear interpolated — no boxing
          const [red, green, blue] = scoreToRGB(Math.max(0, Math.min(1, score)))
          const baseAlpha = 0.45 * edgeFade

          // Sample cloud grid with its own spacing — fully bilinear
          const cLatMax = cGrid.lats[0], cLonMin = cGrid.lons[0]
          const cRows = cGrid.lats.length, cCols = cGrid.lons.length
          const cSp   = cGrid.lats.length > 1 ? Math.abs(cGrid.lats[0] - cGrid.lats[1]) : CLOUD_SPACING
          const cci = (cLatMax - lat) / cSp, ccj = (lon - cLonMin) / cSp
          const cr0 = Math.floor(cci), cr1 = cr0 + 1
          const cc0 = Math.floor(ccj), cc1 = cc0 + 1

          let cloudVal = 0
          if (cr0 >= 0 && cr1 < cRows && cc0 >= 0 && cc1 < cCols) {
            const cv = bicubicSample(cGrid.grid, cRows, cCols, cci, ccj)
            cloudVal = cv != null ? cv : 0
          }

          // Fixed 50% max alpha for cloud overlay — prevents hard blocking
          // cloudVal is 0 (clear) to 1 (overcast), scales the overlay
          const oA = cloudVal * 0.50 * edgeFade
          const cA = baseAlpha

          let outR = red * cA, outG = green * cA, outB = blue * cA, outA = cA
          outR = 200 * oA + outR * (1 - oA)
          outG = 0   * oA + outG * (1 - oA)
          outB = 0   * oA + outB * (1 - oA)
          outA = oA + outA * (1 - oA)

          data[idx]     = Math.round(outR / Math.max(outA, 0.001))
          data[idx + 1] = Math.round(outG / Math.max(outA, 0.001))
          data[idx + 2] = Math.round(outB / Math.max(outA, 0.001))
          data[idx + 3] = Math.round(outA * 255)

        } else if (renderMode === 'clouds') {
          // ── Clouds-only: transparent when clear, red only when cloudy ───────
          // score = 0 (overcast) to 1 (clear). Invert for cloud opacity.
          const cloudOpacity = 1 - Math.max(0, Math.min(1, score))
          if (cloudOpacity < 0.01) continue  // clear — show map underneath
          const alpha = Math.round(cloudOpacity * 0.75 * edgeFade * 255)
          data[idx]     = 200
          data[idx + 1] = 0
          data[idx + 2] = 0
          data[idx + 3] = alpha

        } else {
          // ── Bortle-only: full red→green gradient ─────────────────────────────
          const [red, green, blue] = scoreToRGB(Math.max(0, Math.min(1, score)))
          data[idx]     = red
          data[idx + 1] = green
          data[idx + 2] = blue
          data[idx + 3] = Math.round(0.45 * edgeFade * 255)
        }
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
