import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, cloudScore, bortleScore, scoreToColor } from '../utils/scoring.js'
import { GRID_BOUNDS, GRID_SPACING, WEIGHT_CLOUDS, WEIGHT_BORTLE } from '../config.js'

// Bortle map: lat/lon → bortle value (interpolated from known data points)
// We use a simplified grid where unknown areas default to Bortle 5
// This will be enriched over time as more spot data is added
const BORTLE_ANCHOR = [
  // [lat, lon, bortle] — major light pollution sources and dark sky anchors
  // Northeast cities (high bortle)
  [40.71, -74.01, 9], // NYC
  [42.36, -71.06, 8], // Boston
  [42.65, -73.75, 7], // Albany
  [43.05, -76.15, 7], // Syracuse
  [43.16, -77.61, 7], // Rochester
  [42.89, -78.88, 8], // Buffalo
  [42.33, -83.05, 8], // Detroit
  [45.42, -75.70, 7], // Ottawa
  [43.70, -79.42, 8], // Toronto
  [45.50, -73.57, 8], // Montreal
  [41.82, -71.42, 7], // Providence
  [41.31, -72.93, 7], // New Haven
  [39.95, -75.17, 8], // Philadelphia
  // Dark sky areas (low bortle)
  [44.20, -74.30, 2], // Adirondack High Peaks
  [43.97, -74.14, 3], // Newcomb area
  [44.10, -74.52, 2], // Tupper Lake area
  [44.29, -74.18, 3], // Harrietstown
  [43.64, -73.50, 3], // Huletts Landing
  [43.80, -73.38, 3], // Crown Point area
  [43.78, -74.26, 2], // Indian Lake
  [46.50, -77.00, 2], // Algonquin Park
  [47.00, -71.00, 2], // Charlevoix QC
  [45.00, -76.00, 3], // Eastern Ontario
  [44.80, -63.10, 3], // Nova Scotia
  [46.00, -64.00, 3], // New Brunswick
]

function interpolateBortle(lat, lon) {
  // Inverse distance weighting from known anchor points
  let weightSum = 0, valueSum = 0
  for (const [alat, alon, bortle] of BORTLE_ANCHOR) {
    const dist = Math.sqrt((lat-alat)**2 + (lon-alon)**2)
    if (dist < 0.01) return bortle
    const w = 1 / (dist ** 2)
    weightSum += w
    valueSum += w * bortle
  }
  return Math.max(1, Math.min(9, valueSum / weightSum))
}

function scoreToRGBA(score, alpha = 0.65) {
  if (score >= 0.70) return [34, 197, 94, alpha]
  if (score >= 0.50) return [134, 197, 34, alpha]
  if (score >= 0.35) return [234, 179, 8, alpha]
  if (score >= 0.20) return [249, 115, 22, alpha]
  return [239, 68, 68, alpha]
}

export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    // Create a canvas overlay using Leaflet's SVGOverlay approach
    const CanvasLayer = L.Layer.extend({
      onAdd(map) {
        this._map = map
        this._canvas = L.DomUtil.create('canvas', 'heatmap-canvas')
        this._canvas.style.cssText = 'position:absolute;pointer-events:none;opacity:0.75;'
        map.getPanes().overlayPane.appendChild(this._canvas)
        map.on('moveend zoomend resize', this._redraw, this)
        this._redraw()
      },
      onRemove(map) {
        this._canvas.remove()
        map.off('moveend zoomend resize', this._redraw, this)
      },
      _redraw() {
        if (!this._map) return
        const map = this._map
        const canvas = this._canvas
        const bounds = map.getBounds()
        const size = map.getSize()
        canvas.width = size.x
        canvas.height = size.y
        canvas.style.width = size.x + 'px'
        canvas.style.height = size.y + 'px'

        const topLeft = map.latLngToContainerPoint(bounds.getNorthWest())
        canvas.style.left = topLeft.x + 'px'
        canvas.style.top = topLeft.y + 'px'

        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (cloudLoading) return

        const step = GRID_SPACING
        for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += step) {
          for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += step) {
            const pt1 = map.latLngToContainerPoint([lat, lon])
            const pt2 = map.latLngToContainerPoint([lat - step, lon + step])

            const cloud = getCloudAt ? getCloudAt(
              parseFloat(lat.toFixed(2)),
              parseFloat(lon.toFixed(2)),
              selectedHour
            ) : 50
            const bortle = interpolateBortle(lat, lon)

            let score
            if (mode === 'clouds') score = 1 - cloud/100
            else if (mode === 'bortle') score = bortleScore(bortle)
            else score = combinedScore(cloud, bortle)

            const [r, g, b, a] = scoreToRGBA(score, 0.60)
            ctx.fillStyle = `rgba(${r},${g},${b},${a})`
            ctx.fillRect(
              Math.floor(pt1.x), Math.floor(pt2.y),
              Math.ceil(pt2.x - pt1.x) + 1,
              Math.ceil(pt1.y - pt2.y) + 1
            )
          }
        }
      },
    })

    const layer = new CanvasLayer()
    layer.addTo(map)
    layerRef.current = layer
    canvasRef.current = layer

    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [map])

  // Redraw when props change
  useEffect(() => {
    if (layerRef.current) layerRef.current._redraw()
  }, [mode, selectedHour, getCloudAt, cloudLoading])

  return null
}
