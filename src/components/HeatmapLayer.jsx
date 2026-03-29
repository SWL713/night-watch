import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { bortleScore } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

// ── Lorenz Light Pollution Atlas tile layer ────────────────────────────────────
// Self-hosted tiles cut from David Lorenz's World Atlas 2024.
// Remapped to warm transparent→yellow→red color scheme:
//   truly dark pixels → fully transparent
//   low pollution     → faint warm yellow
//   high pollution    → deep red
// Uses canvas recolor on Lorenz's clean, artifact-free data.

const LP_ATTRIB = 'Sky brightness: <a href="https://djlorenz.github.io/astronomy/lp" target="_blank" rel="noopener">© David Lorenz</a>'
const LP_BASE   = import.meta.env.BASE_URL + 'lp_tiles'

// Map Lorenz's specific color palette to a pollution intensity 0-1 value.
// Uses hue detection to correctly map dark blues (low pollution) near zero.
function lorenzToIntensity(r, g, b) {
  const total = r + g + b
  if (total < 20) return 0

  const maxC = Math.max(r, g, b)
  const bFrac = b / (total + 1)
  const gFrac = g / (total + 1)
  const rFrac = r / (total + 1)

  if (b === maxC && bFrac > 0.40 && total < 300) return Math.min(0.18, (total / 300) * 0.18)
  if (g > r && b > r && bFrac > 0.25 && gFrac > 0.30) return 0.18 + (total / 600) * 0.12
  if (g === maxC && gFrac > 0.40 && r < g * 0.75) return 0.30 + (total / 700) * 0.12
  if (g >= r && gFrac > 0.35 && rFrac > 0.25) return 0.42 + ((r / (g + 1)) * 0.10)
  if (r > 150 && g > 150 && Math.abs(r - g) < 60 && bFrac < 0.15) return 0.52 + ((r / 255) * 0.12)
  if (r === maxC && rFrac > 0.45 && gFrac > 0.15 && gFrac < 0.40) return 0.64 + ((1 - gFrac * 2) * 0.15)
  if (r === maxC && rFrac > 0.50 && gFrac < 0.20) return 0.79 + (rFrac - 0.50) * 0.42
  if (total > 600) return 1.0
  return Math.min(1, (r * 0.299 + g * 0.587 + b * 0.114) / 255)
}

const LorenzWarmLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('canvas')
    tile.width  = 256
    tile.height = 256

    const url = `${LP_BASE}/${coords.z}/${coords.x}/${coords.y}.png`
    const img = new Image()
    img.onload = () => {
      const ctx = tile.getContext('2d')
      ctx.drawImage(img, 0, 0, 256, 256)
      const imageData = ctx.getImageData(0, 0, 256, 256)
      const d = imageData.data
      const w = 256, h = 256

      // Convert Lorenz colors to intensity float map
      const intensity = new Float32Array(w * h)
      for (let i = 0; i < d.length; i += 4) {
        const px = i / 4
        if (d[i+3] === 0) { intensity[px] = 0; continue }
        intensity[px] = lorenzToIntensity(d[i], d[i+1], d[i+2])
      }

      // Single blur pass (3x3) — smooths without over-blurring
      // Reduces blocky zone borders while keeping edges readable
      const blurred = new Float32Array(w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0, n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x+dx, ny = y+dy
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
              sum += intensity[ny*w+nx]; n++
            }
          }
          blurred[y*w+x] = sum / n
        }
      }

      // Remap: yellow → amber → orange → red → pink/red
      // Fully transparent below threshold, opacity scales up with intensity
      for (let px = 0; px < w * h; px++) {
        const v = blurred[px]
        const i = px * 4

        if (v < 0.04) {
          d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0
          continue
        }

        let nr, ng, nb, alpha
        if (v < 0.22) {
          // Faint yellow — bortle 2, barely visible
          const t = (v - 0.04) / 0.18
          nr = 255; ng = Math.round(220 - 10*t); nb = 0
          alpha = Math.round(t * 30)  // 0-30, very faint
        } else if (v < 0.42) {
          // Yellow — bortle 3
          const t = (v - 0.22) / 0.20
          nr = 255; ng = Math.round(210 - 30*t); nb = 0
          alpha = Math.round(30 + t * 35)  // 30-65
        } else if (v < 0.58) {
          // Amber — bortle 4-5
          const t = (v - 0.42) / 0.16
          nr = 255; ng = Math.round(180 - 80*t); nb = 0
          alpha = Math.round(65 + t * 45)  // 65-110
        } else if (v < 0.72) {
          // Orange — bortle 5-6
          const t = (v - 0.58) / 0.14
          nr = 255; ng = Math.round(100 - 70*t); nb = 0
          alpha = Math.round(110 + t * 40)  // 110-150
        } else if (v < 0.86) {
          // Red — bortle 6-7
          const t = (v - 0.72) / 0.14
          nr = 255; ng = Math.round(30 - 20*t); nb = 0
          alpha = Math.round(150 + t * 40)  // 150-190
        } else {
          // Pink/red — bortle 8-9 / city core
          const t = Math.min(1, (v - 0.86) / 0.14)
          nr = 255; ng = 10; nb = Math.round(t * 60)  // hint of pink
          alpha = Math.round(190 + t * 40)  // 190-230
        }

        d[i]=nr; d[i+1]=ng; d[i+2]=nb; d[i+3]=Math.round(alpha * 0.85)
      }

      ctx.putImageData(imageData, 0, 0)
      done(null, tile)
    }
    img.onerror = () => done(null, tile)
    img.src = url
    return tile
  }
})

function createLorenzLayer() {
  return new LorenzWarmLayer({
    attribution:   LP_ATTRIB,
    zIndex:        190,
    maxNativeZoom: 8,
    maxZoom:       22,
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
  return { grid: gaussianSmooth(raw, lats.length, lons.length, 1.5, 3), lats, lons }
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
    const FADE = spacing * 8
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

        const rawFade = Math.max(0, Math.min(1,
          Math.min(ll.lat - lats[rows-1], latMax - ll.lat,
                   ll.lng - lonMin, lons[cols-1] - ll.lng) / FADE))
        // Smooth power curve — fades gradually rather than linearly
        const edgeFade = Math.pow(rawFade, 0.4)

        const idx = (py * W + px) * 4

        // Raised floor to 25% — thin cirrus and model noise below this is
        // invisible to aurora chasers so don't show it as red.
        // Full opacity ramp completes at 55% — genuinely cloudy areas show clearly.
        if (cf < 0.25) continue
        const cloudFade = cf < 0.55 ? (cf - 0.25) / 0.30 : 1.0

        if (mode === 'clouds') {
          // Standalone: transparent=clear → red=cloudy
          data[idx] = 180; data[idx+1] = 0; data[idx+2] = 10
          data[idx+3] = Math.round(cf * 0.55 * edgeFade * cloudFade * 255)
        } else {
          // Combined: transparent=clear → red=cloudy, over VIIRS tiles
          data[idx] = 180; data[idx+1] = 0; data[idx+2] = 10
          data[idx+3] = Math.round(cf * 0.55 * edgeFade * cloudFade * 255)
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)
  },
})

// ── Main component ────────────────────────────────────────────────────────────
export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading, cloudData }) {
  const map          = useMap()
  const tileLayerRef = useRef(null)
  const canvasRef    = useRef(null)
  const [bortleGrid, setBortleGrid] = useState(null)

  useEffect(() => { loadBortleGrid().then(g => { if (g) setBortleGrid(g) }) }, [])

  const showTiles  = mode === 'bortle' || mode === 'combined'
  const showCanvas = mode === 'clouds' || mode === 'combined'

  useEffect(() => {
    if (showTiles && !tileLayerRef.current) {
      tileLayerRef.current = createLorenzLayer()
      tileLayerRef.current.addTo(map)
    } else if (!showTiles && tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }
  }, [showTiles, map])

  useEffect(() => {
    if (showCanvas && !cloudLoading && getCloudAt) {
      if (!canvasRef.current) {
        canvasRef.current = new CloudCanvas({})
        canvasRef.current.addTo(map)
      }
      canvasRef.current.update(buildCloudGrid(getCloudAt, selectedHour), mode)
    } else if (!showCanvas && canvasRef.current) {
      map.removeLayer(canvasRef.current)
      canvasRef.current = null
    }
    // When cloudLoading, leave any existing canvas in place (don't clear it)
  }, [showCanvas, mode, selectedHour, getCloudAt, cloudLoading, cloudData, bortleGrid, map])

  useEffect(() => () => {
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    if (canvasRef.current)    { map.removeLayer(canvasRef.current);    canvasRef.current    = null }
  }, [map])

  return null
}
