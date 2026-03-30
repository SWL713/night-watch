// Cloud data utility functions
// Plain utilities with zero Leaflet imports — safe to import from any component

/**
 * Get the 8-hour average cloud cover at a specific lat/lon
 * by snapping to the nearest grid point.
 * Used by SpotPins to show cloud forecast on spot cards.
 */
export function getAvgCloudForSpot(cloudData, lat, lon) {
  if (!cloudData?.points) return null
  const spacing = cloudData.spacing || 0.1
  const la0 = parseFloat((Math.round(lat / spacing) * spacing).toFixed(1))
  const lo0 = parseFloat((Math.round(lon / spacing) * spacing).toFixed(1))
  const key = `${la0.toFixed(1)},${lo0.toFixed(1)}`
  const forecasts = cloudData.points[key]
  if (!forecasts?.length) return null
  return forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
}
