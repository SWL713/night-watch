import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { scoreToRGB, bortleScore } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

// ── NASA GIBS VIIRS tile layer — recolored to red/transparent ────────────────
// Fetches VIIRS night light tiles, renders each to canvas, remaps colors:
//   black pixels (dark sky)     → fully transparent (base map shows through)
//   bright pixels (light polln) → red (bad for aurora)
// This gives us: roads/lakes visible everywhere, light pollution glows red.

const GIBS_LAYER  = 'VIIRS_SNPP_DayNightBand_ENCC'
const GIBS_DATE   = '2023-01-01'
const GIBS_ATTRIB = '© <a href="https://earthdata.nasa.gov" target="_blank" rel="noopener">NASA GIBS</a> VIIRS'

const GibsRedLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const tile   = document.createElement('canvas')
    tile.width   = 256
    tile.height  = 256

    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GIBS_LAYER}/default/${GIBS_DATE}/GoogleMapsCompatible_Level8/${coords.z}/${coords.y}/${coords.x}.jpg`

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = tile.getContext('2d')
      ctx.drawImage(img, 0, 0, 256, 256)

      const imageData = ctx.getImageData(0, 0, 256, 256)
      const d = imageData.data

      // Hybrid normalization:
      //   Floor = per-tile minimum (removes JPEG encoding offset, ~same across tiles)
      //   Ceiling = fixed global value (keeps all tiles on the same absolute scale)
      // This fixes mixed VT tiles where one small town was pulling min/max apart,
      // making dark wilderness look artificially bright relative to pure-city tiles.
      let minLum = 1
      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255
        if (lum < minLum) minLum = lum
      }
      const GLOBAL_CEIL = 0.75  // cities ~0.8-1.0, this clips nothing meaningful
      const cutoff = minLum + (GLOBAL_CEIL - minLum) * 0.32
      const range  = GLOBAL_CEIL - minLum

      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255

        if (lum <= cutoff || range < 0.05) {
          d[i+3] = 0  // transparent
        } else {
          const remapped  = Math.min(1, (lum - cutoff) / (GLOBAL_CEIL - cutoff))
          const intensity = Math.pow(remapped, 0.75) // bortle 4+ visible, cities semi-transparent

          let r, g, b
          if (intensity < 0.5) {
            const t = intensity / 0.5
            r = Math.round(200 + (255 - 200) * t)
            g = Math.round(60  + (130 - 60)  * t)
            b = 0
          } else {
            const t = (intensity - 0.5) / 0.5
            r = Math.round(255 + (220 - 255) * t)
            g = Math.round(130 + (0   - 130) * t)
            b = Math.round(t * 20)
          }

          d[i]   = r
          d[i+1] = g
          d[i+2] = b
          d[i+3] = Math.round(intensity * 175) // capped so cities stay semi-transparent
        }
      }

      ctx.putImageData(imageData, 0, 0)
      done(null, tile)
    }
    img.onerror = () => done(null, tile)  // empty tile on error — graceful
    img.src = url
    return tile
  }
})

function createGibsLayer() {
  return new GibsRedLayer({
    attribution:   GIBS_ATTRIB,
    zIndex:        190,
    maxNativeZoom: 8,
    maxZoom:       16,
    crossOrigin:   true,
  })
}

// ── Ocean mask ────────────────────────────────────────────────────────────────
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
  for (let i = -R; i <= R; i++) { const v = Math.exp(-i*i/(2*sigma*sigma)); raw.push(v); ksum += v }
  const k = raw.map(v => v / ksum)
  const tmp = Array.from({ length: rows }, () => new Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] == null) continue
      let s = 0, w = 0
      for (let i = -R; i <= R; i++) {
        const v = grid[r][Math.max(0, Math.min(cols-1, c+i))]
        if (v != null) { s += v * k[i+R]; w += k[i+R] }
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
        const v = tmp[Math.max(0, Math.min(rows-1, r+i))][c]
        if (v != null) { s += v * k[i+R]; w += k[i+R] }
      }
      out[r][c] = w > 0 ? s / w : null
    }
  }
  return out
}

// ── Cloud canvas ──────────────────────────────────────────────────────────────
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
      return cloud === null ? null : cloud / 100
    })
  )
  return { grid: gaussianSmooth(raw, lats.length, lons.length, 2.0, 4), lats, lons }
}

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
  update(gridData, mode) { this._gridData = gridData; this._mode = mode; this._redraw() },
  _redraw() {
    if (!this._map || !this._gridData) return
    const map = this._map
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

    const latMax = lats[0], lonMin = lons[0]
    const spacing = Math.abs(lats[0] - lats[1])
    const FADE = spacing * 2
    const mode = this._mode
    const imageData = ctx.createImageData(W, H)
    const data = imageData.data

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
        cf = Math.max(0, Math.min(1, cf))  // cloud fraction 0-1

        const edgeFade = Math.max(0, Math.min(1,
          Math.min(ll.lat - lats[rows-1], latMax - ll.lat,
                   ll.lng - lonMin, lons[cols-1] - ll.lng) / FADE))

        const idx = (py * W + px) * 4

        if (mode === 'clouds') {
          // Standalone: green=clear → red=cloudy
          const [r, g, b] = scoreToRGB(1 - cf)
          data[idx] = r; data[idx+1] = g; data[idx+2] = b
          data[idx+3] = Math.round(0.45 * edgeFade * 255)
        } else {
          // Combined: transparent=clear → red=cloudy, over VIIRS tiles
          data[idx] = 180; data[idx+1] = 0; data[idx+2] = 10
          data[idx+3] = Math.round(cf * 0.78 * edgeFade * 255)
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)
  },
})

// ── Main component ────────────────────────────────────────────────────────────
export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map          = useMap()
  const tileLayerRef = useRef(null)
  const canvasRef    = useRef(null)
  const [bortleGrid, setBortleGrid] = useState(null)

  useEffect(() => { loadBortleGrid().then(g => { if (g) setBortleGrid(g) }) }, [])

  const showTiles  = mode === 'bortle' || mode === 'combined'
  const showCanvas = mode === 'clouds' || mode === 'combined'

  useEffect(() => {
    if (showTiles && !tileLayerRef.current) {
      tileLayerRef.current = createGibsLayer()
      tileLayerRef.current.addTo(map)
    } else if (!showTiles && tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }
  }, [showTiles, map])

  useEffect(() => {
    if (showCanvas) {
      if (!canvasRef.current) {
        canvasRef.current = new CloudCanvas({})
        canvasRef.current.addTo(map)
      }
      if (getCloudAt) {
        canvasRef.current.update(buildCloudGrid(getCloudAt, selectedHour), mode)
      }
    } else if (canvasRef.current) {
      map.removeLayer(canvasRef.current)
      canvasRef.current = null
    }
  }, [showCanvas, mode, selectedHour, getCloudAt, cloudLoading, bortleGrid, map])

  useEffect(() => () => {
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    if (canvasRef.current)    { map.removeLayer(canvasRef.current);    canvasRef.current    = null }
  }, [map])

  return null
}
