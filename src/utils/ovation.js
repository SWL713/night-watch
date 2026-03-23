// Ovation Prime — NOAA real-time aurora forecast
// Fetches the northern hemisphere boundary and viewline latitudes

const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'

export async function fetchOvationBoundaries() {
  try {
    const res = await fetch(OVATION_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // data.coordinates is array of [lon, lat, aurora_probability]
    // Find the auroral oval boundary (where probability first exceeds threshold)
    // and the viewline (where probability > ~1% — visible on clear night)
    const coords = data.coordinates || []

    // Group by longitude, find max probability per longitude band
    const byLon = {}
    for (const [lon, lat, prob] of coords) {
      const key = Math.round(lon)
      if (!byLon[key] || byLon[key].prob < prob) {
        byLon[key] = { lat, prob }
      }
    }

    // Oval boundary: equatorward edge of main oval (probability > 10%)
    // Viewline: equatorward visibility limit (probability > 2%)
    const ovalBoundary = []
    const viewLine = []

    // Build lat bands — find southernmost latitude with prob above threshold per longitude
    const lonGroups = {}
    for (const [lon, lat, prob] of coords) {
      const key = Math.round(lon / 2) * 2 // 2-degree bins
      if (!lonGroups[key]) lonGroups[key] = []
      lonGroups[key].push({ lat, prob })
    }

    for (const [lonStr, points] of Object.entries(lonGroups)) {
      const lon = parseFloat(lonStr)
      if (lon < -85 || lon > -60) continue // only northeast region

      const sorted = points.sort((a,b) => a.lat - b.lat)

      // Oval boundary: southernmost point with prob >= 10
      const ovalPt = sorted.find(p => p.prob >= 10)
      if (ovalPt) ovalBoundary.push([ovalPt.lat, lon])

      // View line: southernmost point with prob >= 2
      const viewPt = sorted.find(p => p.prob >= 2)
      if (viewPt) viewLine.push([viewPt.lat, lon])
    }

    // Sort by longitude for clean polyline drawing
    ovalBoundary.sort((a,b) => a[1] - b[1])
    viewLine.sort((a,b) => a[1] - b[1])

    return {
      ovalBoundary,
      viewLine,
      observationTime: data['Observation Time'] || null,
      forecastTime: data['Forecast Time'] || null,
    }
  } catch (e) {
    console.warn('Ovation fetch failed:', e)
    return { ovalBoundary: [], viewLine: [], observationTime: null, forecastTime: null }
  }
}
