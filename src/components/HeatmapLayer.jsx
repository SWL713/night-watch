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

// Exact RGB lookup against actual Lorenz atlas colors sampled from world2024.png
// Intensity 0 = transparent (pristine/dark), 1.0 = opaque (city core)
const LORENZ_ZONES = [
  [[ 34,  34,  34],  0.00],  // charcoal — pristine → transparent
  [[ 66,  66,  66],  0.00],  // mid grey — near-pristine → transparent
  [[ 20,  47, 114],  0.00],  // dark navy — bortle 1-2 → transparent
  [[ 33,  84, 216],  0.18],  // medium blue — bortle 2-3 → faint yellow
  [[ 15,  87,  20],  0.34],  // dark green — bortle 3 → visible yellow
  [[ 31, 161,  42],  0.46],  // bright green — bortle 4 → yellow
  [[110, 100,  30],  0.58],  // olive brown — bortle 5 → amber
  [[184, 166,  37],  0.68],  // tan/yellow — bortle 6 → orange
  [[191, 100,  30],  0.76],  // orange-brown — bortle 7 → red
  [[253, 150,  80],  0.82],  // orange — bortle 7-8 → deeper red
  [[251,  90,  73],  0.88],  // red-orange — bortle 8 → red
  [[251, 153, 138],  0.93],  // pink — bortle 9 → pink-red
  [[160, 160, 160],  0.96],  // light grey — city bright → pink-red
  [[242, 242, 242],  1.00],  // near white — city core → pink-red
]

function lorenzToIntensity(r, g, b) {
  let best = 0, bestDist = Infinity
  for (let i = 0; i < LORENZ_ZONES.length; i++) {
    const zc = LORENZ_ZONES[i][0]
    const d = (r-zc[0])**2 + (g-zc[1])**2 + (b-zc[2])**2
    if (d < bestDist) { bestDist = d; best = i }
  }
  return LORENZ_ZONES[best][1]
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

      // Gentle 3x3 blur on intensity — softens jagged zone edges
      // Safe: only blends with same-zone or adjacent neighbors, never crosses zero
      const blurred = new Float32Array(w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = intensity[y*w+x]
          if (c === 0) { blurred[y*w+x] = 0; continue }
          // Weighted: center=4, cardinal=2, diagonal=1 (standard Gaussian 3x3)
          let sum = c * 4, wt = 4
          const dirs = [[-1,0,2],[1,0,2],[0,-1,2],[0,1,2],[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]]
          for (const [dy, dx, w2] of dirs) {
            const nx = x+dx, ny = y+dy
            if (nx<0||nx>=w||ny<0||ny>=h) continue
            const nb = intensity[ny*w+nx]
            if (nb === 0) continue  // never blend across zero boundary
            sum += nb * w2; wt += w2
          }
          // Never raise above center value — edges can only soften inward
          blurred[y*w+x] = Math.min(c, sum / wt)
        }
      }

      // Remap: yellow → amber → orange → red → pink/red
      // Fully transparent below threshold, opacity scales up with intensity
      for (let px = 0; px < w * h; px++) {
        const v = blurred[px]
        const i = px * 4

        // Transparent zones (charcoal, grey, dark navy) = intensity 0.00
        if (v === 0) {
          d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0
          continue
        }

        // Final warm ramp aligned to exact Lorenz zone intensities.
        // Philosophy: LP layer owns yellow→orange, clouds own red.
        // Combined: both layers amplify badness — cloudy+polluted = deep red.
        // City core capped at 60% opacity (153 alpha).
        let nr, ng, nb, alpha

        if (v <= 0.18) {
          // Medium blue (bortle 2-3) — faintest yellow
          const t = v / 0.18
          nr = 255; ng = 235; nb = 0
          alpha = Math.round(t * 15)          // 0-15
        } else if (v <= 0.34) {
          // Dark green (bortle 3) — faint yellow, visible step
          const t = (v - 0.18) / 0.16
          nr = 255; ng = Math.round(235 - 10*t); nb = 0
          alpha = Math.round(15 + t * 20)     // 15-35
        } else if (v <= 0.46) {
          // Bright green (bortle 4) — soft yellow
          const t = (v - 0.34) / 0.12
          nr = 255; ng = Math.round(225 - 15*t); nb = 0
          alpha = Math.round(35 + t * 20)     // 35-55
        } else if (v <= 0.58) {
          // Olive brown (bortle 5) — pure mid yellow
          const t = (v - 0.46) / 0.12
          nr = 255; ng = Math.round(210 - 10*t); nb = 0
          alpha = Math.round(55 + t * 20)     // 55-75
        } else if (v <= 0.68) {
          // Tan/yellow (bortle 6) — deeper yellow, approaching amber
          const t = (v - 0.58) / 0.10
          nr = 255; ng = Math.round(200 - 50*t); nb = 0
          alpha = Math.round(75 + t * 20)     // 75-95
        } else if (v <= 0.76) {
          // Orange-brown (bortle 7) — amber
          const t = (v - 0.68) / 0.08
          nr = 255; ng = Math.round(150 - 60*t); nb = 0
          alpha = Math.round(95 + t * 20)     // 95-115
        } else if (v <= 0.82) {
          // Orange (bortle 7-8) — orange
          const t = (v - 0.76) / 0.06
          nr = 255; ng = Math.round(90 - 60*t); nb = 0
          alpha = Math.round(115 + t * 15)    // 115-130
        } else if (v <= 0.88) {
          // Red-orange (bortle 8) — red
          const t = (v - 0.82) / 0.06
          nr = 255; ng = Math.round(30 - 20*t); nb = 0
          alpha = Math.round(130 + t * 15)    // 130-145
        } else if (v <= 0.93) {
          // Pink (bortle 9) — deep red
          const t = (v - 0.88) / 0.05
          nr = 255; ng = Math.round(10 - 10*t); nb = Math.round(t * 30)
          alpha = Math.round(145 + t * 8)     // 145-153
        } else {
          // Light grey / near white — city core — 60% opacity
          nr = 255; ng = 0; nb = 40
          alpha = 153
        }

        d[i]=nr; d[i+1]=ng; d[i+2]=nb; d[i+3]=alpha
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

        if (mode === 'clearsky') {
          // Clear sky finder: binned teal — invert cloud fraction to clearness
          // clearness = 1 - cf (0=totally cloudy, 1=perfectly clear)
          const clearness = 1 - cf

          // Snap to 3 discrete bins + transparent for cloudy
          // Bin edges chosen so each level is visually meaningful
          let alpha
          if (clearness >= 0.80) {
            alpha = 153  // bin 1: excellent (0-20% cloud) — max teal
          } else if (clearness >= 0.55) {
            alpha = 95   // bin 2: good (21-45% cloud) — mid teal
          } else if (clearness >= 0.30) {
            alpha = 45   // bin 3: marginal (46-70% cloud) — faint teal
          } else {
            continue     // bin 4: cloudy (71-100%) — transparent, don't paint
          }

          data[idx] = 0; data[idx+1] = 210; data[idx+2] = 160
          data[idx+3] = Math.round(alpha * edgeFade)
        } else {
          // Cloud cover mode: continuous red wash — cloudy=red, clear=transparent
          if (cf < 0.25) continue
          const cloudFade = cf < 0.55 ? (cf - 0.25) / 0.30 : 1.0
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

  const showTiles  = mode === 'bortle' || mode === 'combined' || mode === 'clearsky_bortle'
  // clearsky rendering is handled by ClearSkyLayer — never render it here
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
      const canvasMode = (mode === 'clearsky' || mode === 'clearsky_bortle') ? 'clearsky' : mode
      canvasRef.current.update(buildCloudGrid(getCloudAt, selectedHour), canvasMode)
      // debug: write to DOM element if present
      const el = document.getElementById('_dbg')
      if (el) el.textContent = `clouds updated: h=${selectedHour} mode=${canvasMode} ${new Date().toISOString().slice(11,19)}`
    } else if (!showCanvas && canvasRef.current) {
      map.removeLayer(canvasRef.current)
      canvasRef.current = null
    }
    // When cloudLoading, leave any existing canvas in place (don't clear it)
  }, [showCanvas, mode, selectedHour, getCloudAt, cloudLoading, cloudData, map])

  useEffect(() => () => {
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    if (canvasRef.current)    { map.removeLayer(canvasRef.current);    canvasRef.current    = null }
  }, [map])

  return null
}
