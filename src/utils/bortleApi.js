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
