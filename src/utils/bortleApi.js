// Auto-fetch Bortle value for a lat/lon when a spot doesn't have one stored.
// Uses lightpollutionmap.info point query → returns SQM → converts to Bortle.
// Results are cached in memory for the session so we don't hammer the API.

const _cache = {}

// SQM (Sky Quality Meter mag/arcsec²) → Bortle class
// Based on Bortle scale definition
function sqmToBortle(sqm) {
  if (sqm >= 22.0) return 1
  if (sqm >= 21.9) return 2
  if (sqm >= 21.5) return 3
  if (sqm >= 20.9) return 4
  if (sqm >= 20.0) return 5
  if (sqm >= 19.1) return 6
  if (sqm >= 18.0) return 7
  if (sqm >= 16.5) return 8
  return 9
}

// Bortle value → color that matches lightpollutionmap.info tile palette
// So spot pins visually match the tiles beneath them
export function bortleToTileColor(bortle) {
  const b = Math.max(1, Math.min(9, bortle))
  // Matches the VIIRS tile palette: dark sky = black/dark, bright = white/red
  const stops = [
    [1, [  0,   0,   0]],  // black          — pristine dark
    [2, [  0,  20,  60]],  // deep navy       — excellent
    [3, [  0,  60, 120]],  // dark blue       — very good
    [4, [  0, 140,  80]],  // teal-green      — good
    [5, [100, 180,   0]],  // yellow-green    — moderate
    [6, [200, 160,   0]],  // amber           — poor
    [7, [220,  80,   0]],  // orange          — bad
    [8, [200,  20,  20]],  // deep red        — very bad
    [9, [240,   0,   0]],  // bright red      — terrible
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [b0, c0] = stops[i]
    const [b1, c1] = stops[i + 1]
    if (b >= b0 && b <= b1) {
      const t = (b - b0) / (b1 - b0)
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * t))
    }
  }
  return [240, 0, 0]
}

// Shift a base [r,g,b] color toward red by cloudFraction (0-1)
export function applyCloudToColor(baseRGB, cloudFraction) {
  const cf = Math.max(0, Math.min(1, cloudFraction))
  const [r, g, b] = baseRGB
  // Lerp toward [200, 0, 20] (deep red = cloudy)
  return [
    Math.round(r + (200 - r) * cf),
    Math.round(g + (0   - g) * cf),
    Math.round(b + (20  - b) * cf),
  ]
}

// Fetch bortle for a lat/lon. Returns a number 1-9.
// Falls back to 5 if API is unreachable.
export async function fetchBortleAt(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  if (_cache[key] !== undefined) return _cache[key]

  try {
    // lightpollutionmap.info point query — returns SQM value
    const url = `https://www.lightpollutionmap.info/QueryRaster/?ql=wa_2015&qt=point&qd=${lon.toFixed(4)},${lat.toFixed(4)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // Response format: {"data": {"wa_2015": <sqm_value>}}
    const sqm = json?.data?.wa_2015 ?? json?.data?.sqm ?? null
    const bortle = sqm !== null ? sqmToBortle(parseFloat(sqm)) : 5
    _cache[key] = bortle
    return bortle
  } catch {
    _cache[key] = 5  // cache the fallback too so we don't retry every render
    return 5
  }
}
