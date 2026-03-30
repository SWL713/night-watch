// PreRenderManager — pre-renders cloud and clear sky layers to offscreen canvases
// Tier 1: zoom ≤ 7 — drawImage from pre-rendered canvas (fast pan/zoom)
// Tier 2: zoom > 7 — live viewport render (high res, small area)
//
// Pure JS, zero Leaflet/React imports — safe to import from anywhere

const HRRR_BOUNDS = { minLat: 38.3, maxLat: 47.7, minLon: -82.2, maxLon: -67.0 }
const GRID_SPACING = 0.1

// Pre-render resolution: 5px per 0.1° grid cell
const PX_PER_CELL = 5
const CANVAS_W = Math.round((HRRR_BOUNDS.maxLon - HRRR_BOUNDS.minLon) / GRID_SPACING * PX_PER_CELL)
const CANVAS_H = Math.round((HRRR_BOUNDS.maxLat - HRRR_BOUNDS.minLat) / GRID_SPACING * PX_PER_CELL)

// Clear sky full-res: 10px per 0.1° for maximum fidelity
const CS_PX_PER_CELL = 10
const CS_CANVAS_W = Math.round((HRRR_BOUNDS.maxLon - HRRR_BOUNDS.minLon) / GRID_SPACING * CS_PX_PER_CELL)
const CS_CANVAS_H = Math.round((HRRR_BOUNDS.maxLat - HRRR_BOUNDS.minLat) / GRID_SPACING * CS_PX_PER_CELL)

// Convert lat/lon to offscreen canvas pixel coordinates
export function latLonToPixel(lat, lon, pxPerCell, bounds = HRRR_BOUNDS) {
  const x = (lon - bounds.minLon) / GRID_SPACING * pxPerCell
  const y = (bounds.maxLat - lat)  / GRID_SPACING * pxPerCell
  return { x, y }
}

// Bilinear interpolation on a point lookup function
function bilinear(lat, lon, lookup, spacing = GRID_SPACING) {
  const lat0 = parseFloat((Math.floor(lat / spacing) * spacing).toFixed(2))
  const lon0 = parseFloat((Math.floor(lon / spacing) * spacing).toFixed(2))
  const lat1 = parseFloat((lat0 + spacing).toFixed(2))
  const lon1 = parseFloat((lon0 + spacing).toFixed(2))
  const tx = (lon - lon0) / spacing
  const ty = (lat - lat0) / spacing
  const fmt = v => parseFloat(v.toFixed(1)).toFixed(1)
  const v00 = lookup(`${fmt(lat0)},${fmt(lon0)}`)
  const v10 = lookup(`${fmt(lat1)},${fmt(lon0)}`)
  const v01 = lookup(`${fmt(lat0)},${fmt(lon1)}`)
  const v11 = lookup(`${fmt(lat1)},${fmt(lon1)}`)
  const vals = [v00, v10, v01, v11]
  const valid = vals.filter(v => v !== null)
  if (!valid.length) return null
  if (valid.length < 2) return valid[0]
  const corners = [
    [v00, (1-tx)*(1-ty)], [v01, tx*(1-ty)],
    [v10, (1-tx)*ty],     [v11, tx*ty],
  ]
  let sum = 0, wt = 0
  for (const [v, w] of corners) {
    if (v === null) continue
    sum += v * w; wt += w
  }
  return wt > 0 ? sum / wt : null
}

// ── Cloud layer pre-render ─────────────────────────────────────────────────

function renderCloudHour(pointAvgs, alpha255Fn) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(CANVAS_W, CANVAS_H)
  const d = imageData.data

  for (let py = 0; py < CANVAS_H; py++) {
    for (let px = 0; px < CANVAS_W; px++) {
      const lat = HRRR_BOUNDS.maxLat - py / PX_PER_CELL * GRID_SPACING
      const lon = HRRR_BOUNDS.minLon + px / PX_PER_CELL * GRID_SPACING
      const cf = bilinear(lat, lon, key => pointAvgs[key] ?? null)
      if (cf === null) continue
      const alpha = alpha255Fn(cf)
      if (alpha <= 0) continue
      const idx = (py * CANVAS_W + px) * 4
      d[idx]=180; d[idx+1]=0; d[idx+2]=10; d[idx+3]=alpha
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// Build per-hour point avg lookup from cloudData
function buildHourAvgs(cloudData, hourIndex) {
  const avgs = {}
  for (const [k, fc] of Object.entries(cloudData.points)) {
    if (!fc?.[hourIndex]) continue
    const val = fc[hourIndex].cloudcover ?? null
    if (val !== null) avgs[k] = val
  }
  return avgs
}

function cloudAlpha(cf) {
  if (cf < 25) return 0
  const fade = cf < 55 ? (cf - 25) / 30 : 1.0
  return Math.round(cf * 0.55 * fade * 2.55)
}

// ── Clear sky pre-render ───────────────────────────────────────────────────

const ANCHORS = [
  { lat: 42.9, lon: -78.9 }, { lat: 43.0, lon: -76.1 },
  { lat: 43.0, lon: -73.8 }, { lat: 44.5, lon: -73.2 },
  { lat: 42.4, lon: -71.1 }, { lat: 40.7, lon: -74.0 },
  { lat: 39.9, lon: -75.2 },
]
const R = 150 / 69
const BLEND = 30 / 69

function buildWindowedAvgs(cloudData, windowHours) {
  const now = Date.now()
  const cutoff = now + windowHours * 3600000
  const avgs = {}
  for (const [k, fc] of Object.entries(cloudData.points)) {
    if (!fc?.length) continue
    const windowed = fc.filter(p => {
      const t = p.timeMs ?? new Date(p.time).getTime()
      return t >= now && t <= cutoff
    })
    const use = windowed.length > 0 ? windowed : fc
    avgs[k] = use.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / use.length
  }
  return avgs
}

function buildAnchorThresholds(avgs) {
  const keys = Object.keys(avgs)
  return ANCHORS.map(anchor => {
    const nearby = keys.filter(k => {
      const [la, lo] = k.split(',').map(parseFloat)
      const d = Math.sqrt((la-anchor.lat)**2 + ((lo-anchor.lon)*Math.cos(anchor.lat*Math.PI/180))**2)
      return d <= R
    })
    const meds = nearby.map(k => avgs[k]).filter(v => v != null).sort((a, b) => a - b)
    if (!meds.length) return null
    const qualCount = meds.filter(m => m <= 45).length
    return {
      lat: anchor.lat, lon: anchor.lon,
      longShot: qualCount / meds.length < 0.05,
      p20: meds[Math.floor(meds.length * 0.20)],
      p40: meds[Math.floor(meds.length * 0.40)],
      p60: Math.min(meds[Math.floor(meds.length * 0.60)], 45),
      p05: meds[Math.floor(meds.length * 0.05)],
    }
  }).filter(Boolean)
}

function renderClearSky(avgs, anchorThresholds) {
  const canvas = document.createElement('canvas')
  canvas.width = CS_CANVAS_W
  canvas.height = CS_CANVAS_H
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(CS_CANVAS_W, CS_CANVAS_H)
  const d = imageData.data
  const lsPixels = new Uint8Array(CS_CANVAS_W * CS_CANVAS_H)
  const AA = 0.015

  for (let py = 0; py < CS_CANVAS_H; py++) {
    for (let px = 0; px < CS_CANVAS_W; px++) {
      const lat = HRRR_BOUNDS.maxLat - py / CS_PX_PER_CELL * GRID_SPACING
      const lon = HRRR_BOUNDS.minLon + px / CS_PX_PER_CELL * GRID_SPACING
      const cf = bilinear(lat, lon, key => avgs[key] ?? null)
      if (cf === null) continue

      const idx = (py * CS_CANVAS_W + px) * 4

      // Normal mode: per-anchor distance-weighted scoring
      let totalWeight = 0, weightedAlpha = 0
      for (const a of anchorThresholds) {
        const dist = Math.sqrt((lat-a.lat)**2 + ((lon-a.lon)*Math.cos(a.lat*Math.PI/180))**2)
        if (dist > R) continue
        if (cf > a.p60) continue
        const weight = dist < R - BLEND ? 1 : Math.max(0, (R - dist) / BLEND)
        if (weight <= 0) continue
        const cfBINS = [
          { maxCf: a.p20, alpha: 153 },
          { maxCf: a.p40, alpha: 95  },
          { maxCf: a.p60, alpha: 45  },
        ]
        let aAlpha = 0
        for (const bin of cfBINS) {
          const lo = bin.maxCf - AA*100
          const hi = bin.maxCf + AA*100
          if (cf > hi) continue
          if (cf <= lo) { aAlpha = bin.alpha; break }
          const t = (hi - cf) / (2*AA*100)
          const s = t * t * (3 - 2*t)
          aAlpha = Math.round(aAlpha + (bin.alpha - aAlpha) * s)
          break
        }
        weightedAlpha += aAlpha * weight
        totalWeight += weight
      }

      if (totalWeight > 0 && weightedAlpha / totalWeight > 2) {
        const alpha = Math.round(weightedAlpha / totalWeight)
        d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=alpha
      } else {
        // Long Shot: only where anchor is in LS mode
        let lsThreshold = null
        for (const a of anchorThresholds) {
          if (!a.longShot) continue
          const dist = Math.sqrt((lat-a.lat)**2 + ((lon-a.lon)*Math.cos(a.lat*Math.PI/180))**2)
          if (dist <= R && (lsThreshold === null || a.p05 < lsThreshold))
            lsThreshold = a.p05
        }
        if (lsThreshold !== null && cf <= lsThreshold + AA*100) {
          const t = Math.max(0, Math.min(1, (lsThreshold + AA*100 - cf) / (2*AA*100)))
          const s = t * t * (3 - 2*t)
          const alpha = Math.round(40 * s)
          if (alpha > 0) {
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            lsPixels[py * CS_CANVAS_W + px] = 1
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)

  // Dashed orange border for Long Shot zones
  ctx.strokeStyle = 'rgba(255,140,0,0.85)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  for (let py = 1; py < CS_CANVAS_H - 1; py++) {
    for (let px = 1; px < CS_CANVAS_W - 1; px++) {
      if (!lsPixels[py * CS_CANVAS_W + px]) continue
      if (!lsPixels[(py-1)*CS_CANVAS_W+px] || !lsPixels[(py+1)*CS_CANVAS_W+px] ||
          !lsPixels[py*CS_CANVAS_W+px-1]   || !lsPixels[py*CS_CANVAS_W+px+1]) {
        ctx.rect(px, py, 1, 1)
      }
    }
  }
  ctx.stroke()

  // Compute longShot flag for banner
  const globalLongShot = anchorThresholds.every(a => a.longShot)
  return { canvas, globalLongShot }
}

// ── Public API ─────────────────────────────────────────────────────────────

export const PRE_RENDER_ZOOM_THRESHOLD = 7

export const BOUNDS = HRRR_BOUNDS
export const CLOUD_PX_PER_CELL = PX_PER_CELL
export const CLEAR_SKY_PX_PER_CELL = CS_PX_PER_CELL
export const CLOUD_CANVAS_W = CANVAS_W
export const CLOUD_CANVAS_H = CANVAS_H
export const CLEAR_SKY_CANVAS_W = CS_CANVAS_W
export const CLEAR_SKY_CANVAS_H = CS_CANVAS_H

export class PreRenderManager {
  constructor() {
    this.cloudCanvases = {}    // { hourIndex: canvas }
    this.clearSkyCanvases = {} // { '4' | '8': { canvas, globalLongShot } }
    this.cloudData = null
    this._idleCallbacks = []
  }

  // Call when new cloudData arrives
  update(cloudData, onComplete) {
    this.cloudData = cloudData
    this.cloudCanvases = {}
    this.clearSkyCanvases = {}
    this._cancelIdle()

    // Render hour 0 and clear sky 8H first (most likely viewed)
    // then queue remaining hours in background
    const tasks = [
      () => this._renderCloudHour(0),
      () => this._renderClearSky(8),
      () => this._renderClearSky(4),
      ...([1,2,3,4,5,6].map(h => () => this._renderCloudHour(h))),
    ]

    let i = 0
    const next = () => {
      if (i >= tasks.length) { onComplete?.(); return }
      tasks[i++]()
      const id = requestIdleCallback ? requestIdleCallback(next, { timeout: 500 }) : setTimeout(next, 16)
      this._idleCallbacks.push(id)
    }
    next()
  }

  _renderCloudHour(hourIndex) {
    if (!this.cloudData) return
    const avgs = buildHourAvgs(this.cloudData, hourIndex)
    this.cloudCanvases[hourIndex] = renderCloudHour(avgs, cloudAlpha)
  }

  _renderClearSky(windowHours) {
    if (!this.cloudData) return
    const avgs = buildWindowedAvgs(this.cloudData, windowHours)
    const anchors = buildAnchorThresholds(avgs)
    this.clearSkyCanvases[windowHours] = renderClearSky(avgs, anchors)
  }

  _cancelIdle() {
    for (const id of this._idleCallbacks) {
      if (requestIdleCallback) cancelIdleCallback(id)
      else clearTimeout(id)
    }
    this._idleCallbacks = []
  }

  getCloudCanvas(hourIndex) { return this.cloudCanvases[hourIndex] ?? null }
  getClearSkyCanvas(windowHours) { return this.clearSkyCanvases[windowHours] ?? null }
  isReady(hourIndex) { return !!this.cloudCanvases[hourIndex] }
  isClearSkyReady(windowHours) { return !!this.clearSkyCanvases[windowHours] }
}

// Singleton
export const preRenderManager = new PreRenderManager()
