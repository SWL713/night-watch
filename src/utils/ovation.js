// Ovation Prime — NOAA real-time aurora forecast
// Uses a CORS proxy since NOAA SWPC doesn't set CORS headers for browser requests

const OVATION_URLS = [
  'https://corsproxy.io/?https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  'https://api.allorigins.win/raw?url=https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
]

export async function fetchOvationBoundaries() {
  let data = null

  for (const url of OVATION_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      data = await res.json()
      if (data?.coordinates) break
    } catch (e) {
      console.warn('Ovation fetch attempt failed:', e)
      continue
    }
  }

  if (!data?.coordinates) {
    console.warn('All Ovation fetch attempts failed')
    return { ovalBoundary: [], viewLine: [], observationTime: null, forecastTime: null }
  }

  const coords = data.coordinates || []

  // Build lon → [points] map for just the northeast region
  const lonGroups = {}
  for (const [lon, lat, prob] of coords) {
    if (lon < -85 || lon > -55) continue  // northeast region only
    const key = Math.round(lon / 2) * 2
    if (!lonGroups[key]) lonGroups[key] = []
    lonGroups[key].push({ lat, prob })
  }

  const ovalBoundary = []
  const viewLine = []

  for (const [lonStr, points] of Object.entries(lonGroups)) {
    const lon = parseFloat(lonStr)
    const sorted = [...points].sort((a, b) => a.lat - b.lat)

    // Oval boundary: southernmost lat with aurora probability >= 10%
    const ovalPt = sorted.find(p => p.prob >= 10)
    if (ovalPt) ovalBoundary.push([ovalPt.lat, lon])

    // Viewline: southernmost lat with probability >= 2%
    const viewPt = sorted.find(p => p.prob >= 2)
    if (viewPt) viewLine.push([viewPt.lat, lon])
  }

  ovalBoundary.sort((a, b) => a[1] - b[1])
  viewLine.sort((a, b) => a[1] - b[1])

  return {
    ovalBoundary,
    viewLine,
    observationTime: data['Observation Time'] || null,
    forecastTime: data['Forecast Time'] || null,
  }
}
