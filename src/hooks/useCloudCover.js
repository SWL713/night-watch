import { useState, useEffect, useRef, useCallback } from 'react'
import { GRID_BOUNDS } from '../config.js'

// 0.25° spacing ~28km — fine enough to look smooth, manageable API calls
const GRID_SPACING = 0.25
export { GRID_SPACING }

function buildGrid() {
  const points = []
  for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += GRID_SPACING) {
    for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += GRID_SPACING) {
      points.push({
        lat: parseFloat(lat.toFixed(2)),
        lon: parseFloat(lon.toFixed(2))
      })
    }
  }
  return points
}

// Open-Meteo supports batch requests — up to 100 locations per call
async function fetchBatch(points) {
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()

  // Response is array when multiple locations, object when single
  const responses = Array.isArray(data) ? data : [data]
  const now = new Date()
  const results = {}

  responses.forEach((d, i) => {
    const pt = points[i]
    if (!pt || !d?.hourly) return
    const times = d.hourly.time.map(t => new Date(t + 'Z'))
    const clouds = d.hourly.cloudcover
    results[`${pt.lat},${pt.lon}`] = times
      .map((t, j) => ({ time: t, cloudcover: clouds[j] }))
      .filter(p => p.time >= new Date(now - 3600000) && p.time <= new Date(now.getTime() + 9 * 3600000))
  })

  return results
}

async function fetchAllGrid(onProgress, onPartialUpdate) {
  const grid = buildGrid()
  const results = {}
  const BATCH_SIZE = 100  // Open-Meteo batch limit

  for (let i = 0; i < grid.length; i += BATCH_SIZE) {
    const batch = grid.slice(i, i + BATCH_SIZE)
    try {
      const batchResults = await fetchBatch(batch)
      Object.assign(results, batchResults)
    } catch (e) {
      // On batch failure, fill with nulls for these points
      batch.forEach(p => { results[`${p.lat},${p.lon}`] = null })
      console.warn('Batch fetch failed:', e)
    }
    const pct = Math.min(100, Math.round((i + BATCH_SIZE) / grid.length * 100))
    onProgress?.(pct)
    onPartialUpdate?.({ grid, results: { ...results } })
    // Gentle rate limiting between batches
    if (i + BATCH_SIZE < grid.length) await new Promise(r => setTimeout(r, 500))
  }

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
      if (cacheRef.current && lastFetchRef.current && (now - lastFetchRef.current) < 3600000) {
        setCloudData(cacheRef.current)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchAllGrid(
          setProgress,
          partial => setCloudData(partial)
        )
        cacheRef.current = data
        lastFetchRef.current = now
        setCloudData(data)
      } catch (e) {
        setError(e.message)
        console.warn('Cloud cover fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 3600000)
    return () => clearInterval(interval)
  }, [])

  const getCloudAt = useCallback((lat, lon, hourOffset = 0) => {
    if (!cloudData?.results) return 50
    // Snap to nearest grid point
    const gridLat = parseFloat((Math.round(lat / GRID_SPACING) * GRID_SPACING).toFixed(2))
    const gridLon = parseFloat((Math.round(lon / GRID_SPACING) * GRID_SPACING).toFixed(2))
    const key = `${gridLat},${gridLon}`
    const forecast = cloudData.results[key]
    if (!forecast || !forecast.length) return 50
    const targetTime = new Date(Date.now() + hourOffset * 3600000)
    const nearest = forecast.reduce((best, pt) =>
      Math.abs(pt.time - targetTime) < Math.abs(best.time - targetTime) ? pt : best
    , forecast[0])
    return nearest ? nearest.cloudcover : 50
  }, [cloudData])

  return { cloudData, loading, progress, error, getCloudAt }
}

export async function fetchSpotForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const times = data.hourly.time.map(t => new Date(t + 'Z'))
  const clouds = data.hourly.cloudcover
  const now = new Date()
  return times
    .map((t, i) => ({ time: t, cloudcover: clouds[i] }))
    .filter(p => p.time >= new Date(now - 3600000) && p.time <= new Date(now.getTime() + 9 * 3600000))
}
