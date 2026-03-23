import { useState, useEffect, useRef } from 'react'
import { GRID_BOUNDS, GRID_SPACING } from '../config.js'

// Build a grid of lat/lon points covering the northeast region
function buildGrid() {
  const points = []
  for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += GRID_SPACING) {
    for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += GRID_SPACING) {
      points.push({ lat: parseFloat(lat.toFixed(2)), lon: parseFloat(lon.toFixed(2)) })
    }
  }
  return points
}

// Fetch cloud cover forecast for a single point from Open-Meteo
// Returns array of { time: Date, cloudcover: number } for next 9 hours
async function fetchPointForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const times = data.hourly.time.map(t => new Date(t + 'Z'))
  const clouds = data.hourly.cloudcover
  const now = new Date()
  return times
    .map((t, i) => ({ time: t, cloudcover: clouds[i] }))
    .filter(p => p.time >= new Date(now - 3600000) && p.time <= new Date(now.getTime() + 9*3600000))
}

// Batch fetch all grid points in chunks to avoid rate limiting
async function fetchAllGrid(onProgress) {
  const grid = buildGrid()
  const results = {}
  const CHUNK = 10
  for (let i = 0; i < grid.length; i += CHUNK) {
    const chunk = grid.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async ({ lat, lon }) => {
      try {
        const forecast = await fetchPointForecast(lat, lon)
        results[`${lat},${lon}`] = forecast
      } catch (e) {
        results[`${lat},${lon}`] = null
      }
    }))
    onProgress?.(Math.min(100, Math.round((i + CHUNK) / grid.length * 100)))
    if (i + CHUNK < grid.length) await new Promise(r => setTimeout(r, 200)) // gentle rate limiting
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
      // Cache for 1 hour — Open-Meteo updates hourly
      const now = Date.now()
      if (cacheRef.current && lastFetchRef.current && (now - lastFetchRef.current) < 3600000) {
        setCloudData(cacheRef.current)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = await fetchAllGrid(setProgress)
        cacheRef.current = data
        lastFetchRef.current = now
        setCloudData(data)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Refresh every hour
    const interval = setInterval(load, 3600000)
    return () => clearInterval(interval)
  }, [])

  // Get cloud cover at a specific lat/lon and time offset (hours from now)
  function getCloudAt(lat, lon, hourOffset = 0) {
    if (!cloudData) return 50 // default to 50% if no data
    const key = `${lat},${lon}`
    const forecast = cloudData.results[key]
    if (!forecast) return 50
    const targetTime = new Date(Date.now() + hourOffset * 3600000)
    // Find nearest hourly forecast
    const nearest = forecast.reduce((best, pt) =>
      Math.abs(pt.time - targetTime) < Math.abs(best.time - targetTime) ? pt : best
    , forecast[0])
    return nearest ? nearest.cloudcover : 50
  }

  return { cloudData, loading, progress, error, getCloudAt }
}

// Fetch cloud cover for a specific spot (used in spot cards)
export async function fetchSpotForecast(lat, lon) {
  return fetchPointForecast(lat, lon)
}
