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
  const g = grid.grid

  // Bilinear interpolation across the 4 surrounding bortle grid points.
  // Eliminates hard zone-boundary steps that get amplified in combined multiply.
  const lat0 = parseFloat((Math.floor(lat / step) * step).toFixed(1))
  const lon0 = parseFloat((Math.floor(lon / step) * step).toFixed(1))
  const lat1 = parseFloat((lat0 + step).toFixed(1))
  const lon1 = parseFloat((lon0 + step).toFixed(1))
  const tx   = (lon - lon0) / step
  const ty   = (lat - lat0) / step

  const v00 = g[`${lat0.toFixed(1)},${lon0.toFixed(1)}`] ?? null
  const v10 = g[`${lat1.toFixed(1)},${lon0.toFixed(1)}`] ?? null
  const v01 = g[`${lat0.toFixed(1)},${lon1.toFixed(1)}`] ?? null
  const v11 = g[`${lat1.toFixed(1)},${lon1.toFixed(1)}`] ?? null

  const valid = [v00, v10, v01, v11].filter(v => v !== null)
  if (valid.length === 0) return 5
  if (valid.length < 2)   return valid[0]

  let sum = 0, weight = 0
  const corners = [
    { v: v00, wx: 1 - tx, wy: 1 - ty },
    { v: v01, wx:     tx, wy: 1 - ty },
    { v: v10, wx: 1 - tx, wy:     ty },
    { v: v11, wx:     tx, wy:     ty },
  ]
  for (const { v, wx, wy } of corners) {
    if (v === null) continue
    const w = wx * wy
    sum    += v * w
    weight += w
  }
  return weight > 0 ? sum / weight : 5
}
