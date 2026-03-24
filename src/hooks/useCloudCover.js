// Cloud cover now loaded from pipeline JSON (updated hourly by GitHub Actions)
// instead of fetching hundreds of Open-Meteo calls from the browser.
// Load time: ~1 second (single HTTP request) vs 2-3 minutes (600 API calls).
// Falls back to direct Open-Meteo fetch if pipeline file is stale/missing.

import { useState, useEffect, useRef, useCallback } from 'react'
import { GRID_BOUNDS } from '../config.js'

export const GRID_SPACING = 0.25  // matches pipeline grid (NDFD at 0.25°)

const CLOUD_URL = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data/cloud_cover.json'
const CACHE_KEY = 'nw_cloud_v2'
const CACHE_TTL = 3600000  // 1 hour

function makeKey(lat, lon, spacing = GRID_SPACING) {
  const r = v => parseFloat((Math.round(v / spacing) * spacing).toFixed(2))
  return `${r(lat)},${r(lon)}`
}

// Load from sessionStorage
function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d?.fetchedAt || Date.now() - d.fetchedAt > CACHE_TTL) return null
    return d
  } catch { return null }
}

function saveCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch {}
}

// Fallback: fetch a single point from Open-Meteo
async function fetchSinglePoint(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const now = new Date()
  return data.hourly.time
    .map((t, i) => ({ time: new Date(t + 'Z'), cloudcover: data.hourly.cloudcover[i] }))
    .filter(p => p.cloudcover !== null && p.time >= new Date(now - 3600000))
}

export function useCloudCover() {
  const [cloudData, setCloudData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState('loading')

  useEffect(() => {
    async function load() {
      // 1. Check session cache first — instant
      const cached = loadCache()
      if (cached) {
        setCloudData(cached)
        setLoading(false)
        setPhase('done')
        setProgress(100)
        return
      }

      setLoading(true)
      setPhase('loading')

      try {
        // 2. Fetch pipeline JSON — single request, ~150KB
        const res = await fetch(CLOUD_URL + `?t=${Math.floor(Date.now() / 300000)}`) // 5min cache bust
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        if (!json?.points || Object.keys(json.points).length < 10) {
          throw new Error('Pipeline data empty or stale')
        }

        // Convert pipeline format {t, cc} to {time, cloudcover}
        // 't' is an absolute ISO timestamp — not relative to pipeline run time
        const results = {}
        for (const [key, forecast] of Object.entries(json.points)) {
          results[key] = forecast.map(p => ({
            time:       new Date(p.t || p.time),
            cloudcover: p.cc ?? p.cloudcover,
          })).filter(p => !isNaN(p.time) && p.cloudcover !== null)
        }

        const data = {
          points:    results,
          spacing:   json.spacing || GRID_SPACING,
          fetchedAt: Date.now(),
          source:    'pipeline',
          lastUpdated: json.last_updated,
        }

        saveCache(data)
        setCloudData(data)
        setProgress(100)
        setPhase('done')
      } catch (e) {
        console.warn('Pipeline cloud fetch failed, falling back to Open-Meteo:', e.message)
        setPhase('fallback')

        // 3. Fallback: coarse grid from Open-Meteo directly
        try {
          const results = {}
          const lats = [], lons = []
          const COARSE = 1.0
          for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += COARSE)
            lats.push(parseFloat(lat.toFixed(1)))
          for (let lon = GRID_BOUNDS.minLon; lon <= GRID_BOUNDS.maxLon; lon += COARSE)
            lons.push(parseFloat(lon.toFixed(1)))

          let done = 0
          const total = lats.length * lons.length

          for (const lat of lats) {
            for (const lon of lons) {
              const fc = await fetchSinglePoint(lat, lon)
              if (fc) results[`${lat},${lon}`] = fc
              done++
              setProgress(Math.round(done / total * 100))
              await new Promise(r => setTimeout(r, 60))
            }
          }

          const data = { points: results, spacing: COARSE, fetchedAt: Date.now(), source: 'fallback' }
          saveCache(data)
          setCloudData(data)
          setPhase('done')
        } catch (e2) {
          setError(e2.message)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
    const iv = setInterval(() => {
      try { sessionStorage.removeItem(CACHE_KEY) } catch {}
      load()
    }, CACHE_TTL)
    return () => clearInterval(iv)
  }, [])

  // Use a ref so getCloudAt is always fresh without causing re-renders
  const cloudDataRef = useRef(null)
  useEffect(() => { cloudDataRef.current = cloudData }, [cloudData])

  // Stable function reference — reads from ref so always uses latest data
  const getCloudAt = useCallback((lat, lon, hourOffset = 0) => {
    const data = cloudDataRef.current
    if (!data?.points) return null
    const spacing = data.spacing || GRID_SPACING
    const key     = makeKey(lat, lon, spacing)
    const fc      = data.points[key]
    if (!fc?.length) return null

    const target = Date.now() + hourOffset * 3600000
    let best = fc[0]
    let bestDiff = Math.abs(new Date(fc[0].time).getTime() - target)
    for (let i = 1; i < fc.length; i++) {
      const diff = Math.abs(new Date(fc[i].time).getTime() - target)
      if (diff < bestDiff) { bestDiff = diff; best = fc[i] }
    }
    return best ? (best.cloudcover ?? best.cc ?? null) : null
  }, []) // stable — reads from ref

  const coverage = cloudData?.points ? Object.keys(cloudData.points).length : 0
  const total    = cloudData?.points ? Object.keys(cloudData.points).length : 0

  return { cloudData, loading, progress, error, getCloudAt, coverage, total, phase }
}

export async function fetchSpotForecast(lat, lon) {
  return fetchSinglePoint(lat, lon)
}
