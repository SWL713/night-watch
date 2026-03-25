import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { scoreToRGB } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'

// ── Light pollution tile layer ────────────────────────────────────────────────
// lightpollutionmap.info VIIRS 2023 tiles — 500m resolution
// Attribution required per their terms of use
const LP_TILE_URL = 'https://www.lightpollutionmap.info/tiles/viirs_2023/{z}/{x}/{y}.png'
const LP_ATTRIBUTION = '© <a href="https://www.lightpollutionmap.info" target="_blank" rel="noopener">lightpollutionmap.info</a> (Cinzano et al.)'

// ── Ocean mask (east coast) ───────────────────────────────────────────────────
const COAST_MASK = {
  38.0: -74.5, 38.5: -74.2, 39.0: -74.0, 39.5: -73.8,
  40.0: -73.5, 40.5: -73.0, 41.0: -71.8, 41.5: -71.2,
  42.0: -69.9, 42.5: -70.0, 43.0: -70.5, 43.5: -70.2,
  44.0: -69.2, 44.5: -67.5, 45.0: -67.0, 45.5: -67.0,
  46.0: -67.5, 46.5: -68.0, 47.0: -68.5, 47.5: -69.0,
  48.0: -69.5,
}
const COAST_LATS = Object.keys(COAST_MASK).map(Number).sort((a, b) => a - b)
function maxLonForLat(lat) {
  for (const cl of COAST_LATS) { if (lat <= cl) return COAST_MASK[cl] }
  return GRID_BOUNDS.maxLon
}
function isOcean(lat, lon) { return lon > maxLonForLat(lat) }

const CLOUD_SPACING = 0.1

// ── Gaussian smoother ─────────────────────────────────────────────────────────
function gaussianSmooth(grid, rows, cols, sigma = 2.0, R = 4) {
  let ksum = 0
  const raw = []
  for (let i = -R; i <= R; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); raw.push(v); ksum += v }
  const k = raw.map(v => v / ksum)

  const tmp = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] == null) continue
      let s = 0, w = 0
      for (let i = -R; i <= R; i++) {
        const v = grid[r][Math.max(0, Math.min(cols - 1, c + i))]
        if (v != null) { s += v * k[i + R]; w += k[i + R] }
      }
      tmp[r][c] = w > 0 ? s / w : null
    }
  }
  const out = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tmp[r][c] == null) continue
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

// ── Build cloud grid (0-1 fraction per cell) ──────────────────────────────────
function buildCloudGrid(getCloudAt, selectedHour) {
  const pad = CLOUD_SPACING * 2
  const lats = [], lons = []
  for (let lat = GRID_BOUNDS.maxLat + pad; lat >= GRID_BOUNDS.minLat - pad - 0.001; lat -= CLOUD_SPACING)
    lats.push(parseFloat(lat.toFixed(2)))
  for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.001; lon += CLOUD_SPACING)
    lons.push(parseFloat(lon.toFixed(2)))

  const raw = lats.map(lat =>
    lons.map(lon => {
      if (isOcean(lat, lon)) return null
      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
      return cloud === null ? null : cloud / 100  // 0-1 fraction
    })
  )
  const grid = gaussianSmooth(raw, lats.length, lons.length, 2.0, 4)
  return { grid, lats, lons }
}

// ── Canvas layer for clouds ───────────────────────────────────────────────────
// mode='clouds'   → green-to-red based on cloud cover (standalone cloud view)
// mode='combined' → transparent-to-red overlay on top of light pollution tiles
const CloudCanvas = L.Layer.extend({
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

  update(gridData, mode) {
    this._gridData = gridData
    this._mode = mode
    this._redraw()
  },

  _redraw() {
    if (!this._map || !this._gridData) return
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
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    const { grid, lats, lons } = this._gridData
    const rows    = lats.length
    const cols    = lons.length
    const mode    = this._mode
    if (rows < 2 || cols < 2) return

    const latMax  = lats[0]
    const lonMin  = lons[0]
    const spacing = Math.abs(lats[0] - lats[1])
    const FADE    = spacing * 2

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

        // Bilinear sample of cloud fraction
        const s00 = grid[r0][c0], s10 = grid[r0][c1]
        const s01 = grid[r1][c0], s11 = grid[r1][c1]
        const vals = [s00, s10, s01, s11].filter(v => v != null)
        if (vals.length === 0) continue
        const tx = cj - c0, ty = ci - r0
        let cf
        if (vals.length === 4) {
          cf = s00 + (s10 - s00) * tx + (s01 - s00) * ty + (s00 - s10 - s01 + s11) * tx * ty
        } else {
          cf = vals.reduce((a, b) => a + b, 0) / vals.length
        }
        cf = Math.max(0, Math.min(1, cf))

        const distFromEdge = Math.min(
          lat - lats[rows - 1], latMax - lat,
          lon - lonMin, lons[cols - 1] - lon
        )
        const edgeFade = Math.max(0, Math.min(1, distFromEdge / FADE))

        const idx = (py * W + px) * 4

        if (mode === 'clouds') {
          // Standalone cloud view: green=clear, red=cloudy
          const [r, g, b] = scoreToRGB(1 - cf)
          data[idx]     = r
          data[idx + 1] = g
          data[idx + 2] = b
          data[idx + 3] = Math.round(0.45 * edgeFade * 255)
        } else {
          // Combined mode: transparent=clear, red=cloudy — sits over light pollution tiles
          // Alpha scales with cloud fraction so clear sky shows tiles fully
          const alpha = cf * 0.75 * edgeFade
          data[idx]     = 180
          data[idx + 1] = 0
          data[idx + 2] = 10
          data[idx + 3] = Math.round(alpha * 255)
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)
  },
})

// ── Main component ────────────────────────────────────────────────────────────
export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map          = useMap()
  const tileLayerRef = useRef(null)   // lightpollution tiles — bortle + combined modes
  const canvasRef    = useRef(null)   // cloud canvas — clouds + combined modes

  const showTiles  = mode === 'bortle'   || mode === 'combined'
  const showCanvas = mode === 'clouds'   || mode === 'combined'

  // ── Tile layer lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (showTiles && !tileLayerRef.current) {
      tileLayerRef.current = L.tileLayer(LP_TILE_URL, {
        opacity:     0.85,
        attribution: LP_ATTRIBUTION,
        zIndex:      190,
      }).addTo(map)
    } else if (!showTiles && tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }
  }, [showTiles, map])

  // ── Cloud canvas lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (showCanvas && !canvasRef.current) {
      canvasRef.current = new CloudCanvas({})
      canvasRef.current.addTo(map)
    } else if (!showCanvas && canvasRef.current) {
      map.removeLayer(canvasRef.current)
      canvasRef.current = null
    }

    if (showCanvas && canvasRef.current && getCloudAt) {
      const gridData = buildCloudGrid(getCloudAt, selectedHour)
      canvasRef.current.update(gridData, mode)
    }
  }, [showCanvas, mode, selectedHour, getCloudAt, cloudLoading, map])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
      if (canvasRef.current)    { map.removeLayer(canvasRef.current);    canvasRef.current    = null }
    }
  }, [map])

  return null
}
