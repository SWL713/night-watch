// Loads and queries the pre-computed Bortle grid from data/bortle_grid.json
// 0.1° resolution (~10km) — 17,271 points covering lat 38-48N, lon 82.5-65.5W

const GRID_URL = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data/bortle_grid.json'
let _cache = null

export async function loadBortleGrid() {
  if (_cache) return _cache
  try {
    const res = await fetch(GRID_URL + '?v=1')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    _cache = await res.json()
    return _cache
  } catch (e) {
    console.warn('Bortle grid load failed:', e.message)
    return null
  }
}

export function getBortle(grid, lat, lon) {
  if (!grid?.grid) return 5  // default
  const step = grid.step || 0.1
  const gLat = Math.round(lat / step) * step
  const gLon = Math.round(lon / step) * step
  const key  = `${gLat.toFixed(1)},${gLon.toFixed(1)}`
  return grid.grid[key] ?? 5
}
