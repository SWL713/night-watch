import { useState, useEffect, useRef, useCallback } from 'react'
import { GRID_BOUNDS } from '../config.js'

export const GRID_SPACING = 0.25

function roundCoord(val) {
  return Math.round(val / GRID_SPACING) * GRID_SPACING
}

function makeKey(lat, lon) {
  return `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`
}

function buildGrid() {
  const points = []
  const pad = GRID_SPACING * 2
  for (let lat = GRID_BOUNDS.minLat - pad; lat <= GRID_BOUNDS.maxLat + pad + 0.01; lat += GRID_SPACING) {
    for (let lon = GRID_BOUNDS.minLon - pad; lon <= GRID_BOUNDS.maxLon + pad + 0.01; lon += GRID_SPACING) {
      const rlat = parseFloat(roundCoord(lat).toFixed(2))
      const rlon = parseFloat(roundCoord(lon).toFixed(2))
      points.push({ lat: rlat, lon: rlon, key: `${rlat.toFixed(2)},${rlon.toFixed(2)}` })
    }
  }
  return points
}

// Keep FULL 48-hour forecast — don't filter at fetch time
// This ensures all hour offsets 0-8 have real data
async function fetchBatch(points) {
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloudcover&forecast_days=2&timezone=UTC`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  const responses = Array.isArray(raw) ? raw : [raw]

  if (responses.length !== points.length) {
    throw new Error(`Expected ${points.length} responses, got ${responses.length}`)
  }

  const results = {}
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const d = responses[i]
    if (!d?.hourly?.time || !d?.hourly?.cloudcover) {
      results[pt.key] = null
      continue
    }
    // Store ALL 48 hours as {time, cloudcover} — look up by offset at render time
    results[pt.key] = d.hourly.time.map((t, j) => ({
      time: new Date(t + 'Z'),
      cloudcover: d.hourly.cloudcover[j] ?? null,
    })).filter(p => p.cloudcover !== null)
  }
  return results
}

async function fetchSingle(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.hourly.time.map((t, i) => ({
    time: new Date(t + 'Z'),
    cloudcover: data.hourly.cloudcover[i] ?? null,
  })).filter(p => p.cloudcover !== null)
}

async function fetchAllGrid(onProgress, onPartialUpdate) {
  const grid = buildGrid()
  const results = {}
  const BATCH = 50

  for (let i = 0; i < grid.length; i += BATCH) {
    const batch = grid.slice(i, i + BATCH)
    try {
      const batchResults = await fetchBatch(batch)
      Object.assign(results, batchResults)
    } catch (e) {
      console.warn(`Batch ${i} failed (${e.message}), falling back to individual`)
      for (const pt of batch) {
        try {
          results[pt.key] = await fetchSingle(pt.lat, pt.lon)
          await new Promise(r => setTimeout(r, 60))
        } catch {
          results[pt.key] = null
        }
      }
    }
    onProgress?.(Math.min(99, Math.round((i + BATCH) / grid.length * 100)))
    onPartialUpdate?.({ grid, results: { ...results } })
    if (i + BATCH < grid.length) await new Promise(r => setTimeout(r, 300))
  }

  onProgress?.(100)
  return { grid, results }
}

export function useCloudCover() {
  const [cloudData, setCloudData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const cacheRef = useRef(null)
  const lastFetchRef = useRef(null)

  useEffect(() => {
    async function load() {
      const now = Date.now()
      if (cacheRef.current && lastFetchRef.current && now - lastFetchRef.current < 3600000) {
        setCloudData(cacheRef.current)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchAllGrid(setProgress, partial => setCloudData(partial))
        cacheRef.current = data
        lastFetchRef.current = now
        setCloudData(data)
      } catch (e) {
        setError(e.message)
        console.warn('Cloud fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
    const iv = setInterval(load, 3600000)
    return () => clearInterval(iv)
  }, [])

  const getCloudAt = useCallback((lat, lon, hourOffset = 0) => {
    if (!cloudData?.results) return null
    const key = makeKey(lat, lon)
    const fc = cloudData.results[key]
    if (!fc || !fc.length) return null

    // Find the forecast entry closest to now + hourOffset
    const target = new Date(Date.now() + hourOffset * 3600000)
    let best = fc[0]
    let bestDiff = Math.abs(fc[0].time - target)
    for (let i = 1; i < fc.length; i++) {
      const diff = Math.abs(fc[i].time - target)
      if (diff < bestDiff) { bestDiff = diff; best = fc[i] }
    }
    return best ? best.cloudcover : null
  }, [cloudData])

  const coverage = cloudData?.results
    ? Object.values(cloudData.results).filter(v => v !== null).length
    : 0
  const total = cloudData?.grid?.length || 0

  return { cloudData, loading, progress, error, getCloudAt, coverage, total }
}

export async function fetchSpotForecast(lat, lon) {
  return fetchSingle(lat, lon)
}
