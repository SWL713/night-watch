import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, cloudScore, bortleScore, scoreToRGB } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'
import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

const CLOUD_SPACING = 0.25  // must match pipeline cloud grid spacing

function buildScoreGrid(mode, getCloudAt, selectedHour, bortleGrid) {
  const pad = CLOUD_SPACING * 2
  const lats = [], lons = []
  for (let lat = GRID_BOUNDS.maxLat + pad; lat >= GRID_BOUNDS.minLat - pad - 0.001; lat -= CLOUD_SPACING)
    lats.push(parseFloat(lat.toFixed(2)))
  for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.001; lon += CLOUD_SPACING)
    lons.push(parseFloat(lon.toFixed(2)))

  const grid = lats.map(lat =>
    lons.map(lon => {
      const bortle = bortleGrid ? getBortle(bortleGrid, lat, lon) : 5
      if (mode === 'bortle') return bortleScore(bortle)
      const cloud = getCloudAt ? getCloudAt(lat, lon, selectedHour) : null
      if (mode === 'clouds') return cloud !== null ? 1 - cloud / 100 : bortleScore(bortle) * 0.7
      if (cloud === null) return bortleScore(bortle) * 0.7
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

    // ── Step 1: render score grid into a tiny offscreen canvas (1px per cell)
    // The browser GPU then upscales this with smooth bilinear interpolation —
    // guaranteed smooth on every browser/device, no blur artifacts
    const offW = cols
    const offH = rows
    const off  = document.createElement('canvas')
    off.width  = offW
    off.height = offH
    const octx = off.getContext('2d')
    const offData = octx.createImageData(offW, offH)
    const od = offData.data

    const latMax = lats[0]
    const lonMin = lons[0]

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const score = grid[r][c]
        const [red, green, blue] = scoreToRGB(Math.max(0, Math.min(1, score)))

        // Edge fade
        const lat = lats[r]
        const lon = lons[c]
        const FADE = CLOUD_SPACING * 4
        const distFromEdge = Math.min(
          lat - lats[rows - 1], latMax - lat,
          lon - lonMin, lons[cols - 1] - lon
        )
        const edgeFade = Math.max(0, Math.min(1, distFromEdge / FADE))
        const alpha = Math.round(0.45 * edgeFade * 255)

        const idx = (r * offW + c) * 4
        od[idx]     = red
        od[idx + 1] = green
        od[idx + 2] = blue
        od[idx + 3] = alpha
      }
    }
    octx.putImageData(offData, 0, 0)

    // ── Step 2: compute where the grid corners land on screen
    const topLeft     = map.latLngToContainerPoint([lats[0],        lons[0]])
    const bottomRight = map.latLngToContainerPoint([lats[rows - 1], lons[cols - 1]])

    const sx = topLeft.x * dpr
    const sy = topLeft.y * dpr
    const sw = (bottomRight.x - topLeft.x) * dpr
    const sh = (bottomRight.y - topLeft.y) * dpr

    // ── Step 3: drawImage with smoothing — browser handles interpolation
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(off, sx, sy, sw, sh)
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
