import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, cloudScore, bortleScore } from '../utils/scoring.js'
import { GRID_BOUNDS } from '../config.js'

const GRID_SPACING = 1.0

// Bortle interpolation anchors
const BORTLE_ANCHOR = [
  [40.71, -74.01, 9], [42.36, -71.06, 8], [42.65, -73.75, 7],
  [43.05, -76.15, 7], [43.16, -77.61, 7], [42.89, -78.88, 8],
  [42.33, -83.05, 8], [45.42, -75.70, 7], [43.70, -79.42, 8],
  [45.50, -73.57, 8], [41.82, -71.42, 7], [41.31, -72.93, 7],
  [39.95, -75.17, 8], [44.20, -74.30, 2], [43.97, -74.14, 3],
  [44.10, -74.52, 2], [44.29, -74.18, 3], [43.64, -73.50, 3],
  [43.80, -73.38, 3], [43.78, -74.26, 2], [46.50, -77.00, 2],
  [47.00, -71.00, 2], [45.00, -76.00, 3], [44.80, -63.10, 3],
  [46.00, -64.00, 3],
]

function interpolateBortle(lat, lon) {
  let wSum = 0, vSum = 0
  for (const [alat, alon, b] of BORTLE_ANCHOR) {
    const d = Math.sqrt((lat - alat) ** 2 + (lon - alon) ** 2)
    if (d < 0.01) return b
    const w = 1 / (d * d)
    wSum += w; vSum += w * b
  }
  return Math.max(1, Math.min(9, vSum / wSum))
}

function scoreToRGBA(score) {
  if (score >= 0.70) return [34, 197, 94]
  if (score >= 0.50) return [134, 197, 34]
  if (score >= 0.35) return [234, 179, 8]
  if (score >= 0.20) return [249, 115, 22]
  return [239, 68, 68]
}

export default function HeatmapLayer({ mode, selectedHour, getCloudAt, cloudLoading }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    // Remove previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    if (cloudLoading) return

    // Build grid points
    const points = []
    for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += GRID_SPACING) {
      for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += GRID_SPACING) {
        const gridLat = parseFloat(lat.toFixed(1))
        const gridLon = parseFloat(lon.toFixed(1))
        const cloud = getCloudAt ? getCloudAt(gridLat, gridLon, selectedHour) : 50
        const bortle = interpolateBortle(gridLat, gridLon)

        let score
        if (mode === 'clouds') score = 1 - cloud / 100
        else if (mode === 'bortle') score = bortleScore(bortle)
        else score = combinedScore(cloud, bortle)

        points.push({ lat: gridLat, lon: gridLon, score })
      }
    }

    // Use SVG overlay for smooth rendering
    // Calculate radius in meters to cover 1 degree (~111km) with overlap
    const RADIUS_M = 80000  // 80km radius with overlap at 1° spacing

    const group = L.layerGroup()
    for (const { lat, lon, score } of points) {
      const [r, g, b] = scoreToRGBA(score)
      L.circle([lat, lon], {
        radius: RADIUS_M,
        color: 'none',
        fillColor: `rgb(${r},${g},${b})`,
        fillOpacity: 0.45,
        interactive: false,
      }).addTo(group)
    }

    group.addTo(map)
    layerRef.current = group

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, mode, selectedHour, getCloudAt, cloudLoading])

  return null
}
