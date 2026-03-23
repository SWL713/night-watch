import { useState, useEffect, useRef, useCallback } from 'react'
import { GRID_BOUNDS } from '../config.js'

export const GRID_SPACING = 0.25
const COARSE_SPACING = 1.0
const CACHE_KEY = 'nw_cloud_cache'
const CACHE_TTL = 3600000 // 1 hour

function roundTo(val, step) {
  return Math.round(val / step) * step
}

function makeKey(lat, lon, step = GRID_SPACING) {
  return `${roundTo(lat, step).toFixed(2)},${roundTo(lon, step).toFixed(2)}`
}

function buildGrid(spacing) {
  const points = []
  const pad = spacing * 2
  for (let lat = GRID_BOUNDS.minLat - pad; lat <= GRID_BOUNDS.maxLat + pad + 0.01; lat += spacing) {
    for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.01; lon += spacing) {
      const rlat = parseFloat(roundTo(lat, spacing).toFixed(2))
      const rlon = parseFloat(roundTo(lon, spacing).toFixed(2))
      points.push({ lat: rlat, lon: rlon, key: `${rlat.toFixed(2)},${rlon.toFixed(2)}` })
    }
  }
  return points
}

async function fetchBatch(points) {
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  const responses = Array.isArray(raw) ? raw : [raw]
  if (responses.length !== points.length) throw new Error(`Got ${responses.length}, expected ${points.length}`)

  const results = {}
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const d = responses[i]
    if (!d?.hourly?.time) { results[pt.key] = null; continue }
    results[pt.key] = d.hourly.time
      .map((t, j) => ({ time: new Date(t + 'Z'), cloudcover: d.hourly.cloudcover[j] ?? null }))
      .filter(p => p.cloudcover !== null)
  }
  return results
}

async function fetchSingle(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.hourly.time
    .map((t, i) => ({ time: new Date(t + 'Z'), cloudcover: data.hourly.cloudcover[i] ?? null }))
    .filter(p => p.cloudcover !== null)
}

async function fetchGrid(spacing, onProgress, onPartialUpdate) {
  const grid = buildGrid(spacing)
  const results = {}
  const BATCH = 50

  for (let i = 0; i < grid.length; i += BATCH) {
    const batch = grid.slice(i, i + BATCH)
    try {
      Object.assign(results, await fetchBatch(batch))
    } catch (e) {
      console.warn(`Batch failed: ${e.message}, falling back to singles`)
      for (const pt of batch) {
        try { results[pt.key] = await fetchSingle(pt.lat, pt.lon) }
        catch { results[pt.key] = null }
        await new Promise(r => setTimeout(r, 60))
      }
    }
    onProgress?.(Math.min(99, Math.round((i + BATCH) / grid.length * 100)))
    onPartialUpdate?.({ grid, results: { ...results }, spacing })
    if (i + BATCH < grid.length) await new Promise(r => setTimeout(r, 250))
  }
  onProgress?.(100)
  return { grid, results, spacing, fetchedAt: Date.now() }
}

// Try to load from sessionStorage cache
function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL) return null
    // Re-hydrate Date objects
    for (const key of Object.keys(parsed.results)) {
      if (parsed.results[key]) {
        parsed.results[key] = parsed.results[key].map(p => ({ ...p, time: new Date(p.time) }))
      }
    }
    return parsed
  } catch { return null }
}

function saveCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('Cache save failed:', e.message)
  }
}

export function useCloudCover() {
  const [cloudData, setCloudData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState('') // 'coarse' | 'detail' | 'done'
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false

    async function load() {
      // 1. Check session cache first — instant load
      const cached = loadCache()
      if (cached) {
        setCloudData(cached)
        setLoading(false)
        setPhase('done')
        return
      }

      setLoading(true)

      // 2. Fetch coarse grid first (~60 points, loads in ~5 seconds)
      setPhase('coarse')
      try {
        const coarse = await fetchGrid(COARSE_SPACING,
          p => setProgress(Math.round(p * 0.3)), // coarse = first 30% of progress bar
          partial => { if (!abortRef.current) setCloudData(partial) }
        )
        if (abortRef.current) return
        setCloudData(coarse)
        setLoading(false) // Map is usable now

        // 3. Fetch fine grid in background (~600 points, ~90 seconds)
        setPhase('detail')
        const fine = await fetchGrid(GRID_SPACING,
          p => setProgress(30 + Math.round(p * 0.7)), // fine = remaining 70%
          partial => { if (!abortRef.current) setCloudData(partial) }
        )
        if (abortRef.current) return
        setCloudData(fine)
        saveCache(fine)
        setPhase('done')
      } catch (e) {
        setError(e.message)
        console.warn('Cloud fetch error:', e)
      } finally {
        if (!abortRef.current) setLoading(false)
      }
    }

    load()
    const iv = setInterval(() => {
      // Clear cache and reload every hour
      try { sessionStorage.removeItem(CACHE_KEY) } catch {}
      load()
    }, CACHE_TTL)

    return () => {
      abortRef.current = true
      clearInterval(iv)
    }
  }, [])

  const getCloudAt = useCallback((lat, lon, hourOffset = 0) => {
    if (!cloudData?.results) return null
    // Try fine key first, fall back to coarse
    const fineKey = makeKey(lat, lon, GRID_SPACING)
    const coarseKey = makeKey(lat, lon, COARSE_SPACING)
    const fc = cloudData.results[fineKey] || cloudData.results[coarseKey]
    if (!fc?.length) return null

    const target = new Date(Date.now() + hourOffset * 3600000)
    let best = fc[0], bestDiff = Math.abs(fc[0].time - target)
    for (let i = 1; i < fc.length; i++) {
      const diff = Math.abs(fc[i].time - target)
      if (diff < bestDiff) { bestDiff = diff; best = fc[i] }
    }
    return best ? best.cloudcover : null
  }, [cloudData])

  const coverage = cloudData?.results
    ? Object.values(cloudData.results).filter(v => v !== null).length : 0
  const total = cloudData?.grid?.length || 0

  return { cloudData, loading, progress, error, getCloudAt, coverage, total, phase }
}

export async function fetchSpotForecast(lat, lon) {
  return fetchSingle(lat, lon)
}
