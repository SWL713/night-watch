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
  for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat + 0.01; lat += GRID_SPACING) {
    for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon + 0.01; lon += GRID_SPACING) {
      points.push({
        lat: parseFloat(roundCoord(lat).toFixed(2)),
        lon: parseFloat(roundCoord(lon).toFixed(2)),
        key: `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`
      })
    }
  }
  return points
}

// Open-Meteo batch: up to 100 locations per request, comma-separated lat/lon
async function fetchBatch(points) {
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloudcover&forecast_days=2&timezone=UTC`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()

  // Open-Meteo returns array for multiple locations, object for single
  const responses = Array.isArray(raw) ? raw : [raw]
  const now = new Date()
  const results = {}

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const d = responses[i]
    if (!d?.hourly?.time || !d?.hourly?.cloudcover) {
      results[pt.key] = null
      continue
    }
    const forecast = d.hourly.time
      .map((t, j) => ({ time: new Date(t + 'Z'), cloudcover: d.hourly.cloudcover[j] }))
      .filter(p =>
        p.time >= new Date(now.getTime() - 3600000) &&
        p.time <= new Date(now.getTime() + 9 * 3600000) &&
        p.cloudcover !== null && p.cloudcover !== undefined
      )
    results[pt.key] = forecast.length ? forecast : null
  }

  return results
}

async function fetchAllGrid(onProgress, onPartialUpdate) {
  const grid = buildGrid()
  const results = {}
  const BATCH = 100

  for (let i = 0; i < grid.length; i += BATCH) {
    const batch = grid.slice(i, i + BATCH)
    try {
      const batchResults = await fetchBatch(batch)
      Object.assign(results, batchResults)
    } catch (e) {
      console.warn(`Batch ${i}–${i + BATCH} failed:`, e.message)
      // Fill nulls so keys still exist
      batch.forEach(p => { results[p.key] = null })
    }
    const pct = Math.min(99, Math.round((i + BATCH) / grid.length * 100))
    onProgress?.(pct)
    onPartialUpdate?.({ grid, results: { ...results } })
    if (i + BATCH < grid.length) await new Promise(r => setTimeout(r, 400))
  }

  onProgress?.(100)
  return { grid, results }
}

// Current cloudcover at a key — returns 0–100 or null
function lookupCloud(results, lat, lon) {
  if (!results) return null
  const key = makeKey(lat, lon)
  const fc = results[key]
  if (!fc || !fc.length) return null
  // Return current hour value
  const now = new Date()
  const nearest = fc.reduce((best, pt) =>
    Math.abs(pt.time - now) < Math.abs(best.time - now) ? pt : best
  , fc[0])
  return nearest ? nearest.cloudcover : null
}

function lookupCloudAtHour(results, lat, lon, hourOffset) {
  if (!results) return null
  const key = makeKey(lat, lon)
  const fc = results[key]
  if (!fc || !fc.length) return null
  const target = new Date(Date.now() + hourOffset * 3600000)
  const nearest = fc.reduce((best, pt) =>
    Math.abs(pt.time - target) < Math.abs(best.time - target) ? pt : best
  , fc[0])
  return nearest ? nearest.cloudcover : null
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
    if (!cloudData?.results) return 50
    const val = lookupCloudAtHour(cloudData.results, lat, lon, hourOffset)
    return val !== null ? val : 50
  }, [cloudData])

  // Debug: how many grid points have real data
  const coverage = cloudData?.results
    ? Object.values(cloudData.results).filter(v => v !== null).length
    : 0
  const total = cloudData?.grid?.length || 0

  return { cloudData, loading, progress, error, getCloudAt, coverage, total }
}

export async function fetchSpotForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const now = new Date()
  return data.hourly.time
    .map((t, i) => ({ time: new Date(t + 'Z'), cloudcover: data.hourly.cloudcover[i] }))
    .filter(p => p.time >= new Date(now - 3600000) && p.time <= new Date(now.getTime() + 9 * 3600000))
}
