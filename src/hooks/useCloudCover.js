// Cloud cover loaded from HRRR pipeline JSON (updated hourly by GitHub Actions).
// Single HTTP request, ~150KB, bilinear interpolated 2025-point TCDC grid.
// On fetch failure: serves last cached HRRR data rather than falling back to Open-Meteo.

import { useState, useEffect, useRef, useCallback } from 'react'

export const GRID_SPACING = 0.1   // matches pipeline grid (0.1° for better HRRR resolution)

const CLOUD_URL = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data/cloud_cover.json'
const CACHE_KEY = 'nw_cloud_v2'
const CACHE_TTL = 3600000  // 1 hour — background check handles live freshness

function makeKey(lat, lon, spacing = GRID_SPACING) {
  const r = v => parseFloat((Math.round(v / spacing) * spacing).toFixed(2))
  return `${r(lat)},${r(lon)}`
}

// Load from sessionStorage — invalidate if older than TTL or stale vs server
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
        // Background check: if server has newer data, reload silently
        try {
          const res = await fetch(CLOUD_URL + `?t=${Math.floor(Date.now() / 300000)}`)
          if (res.ok) {
            const json = await res.json()
            if (json?.last_updated && cached.lastUpdated !== json.last_updated) {
              const results = {}
              for (const [key, forecast] of Object.entries(json.points || {})) {
                results[key] = forecast.map(p => ({
                  time:       new Date(p.t || p.time),
                  cloudcover: p.cc ?? p.cloudcover,
                })).filter(p => !isNaN(p.time) && p.cloudcover !== null)
              }
              const data = { points: results, spacing: json.spacing || GRID_SPACING,
                             fetchedAt: Date.now(), source: 'pipeline', lastUpdated: json.last_updated }
              saveCache(data)
              setCloudData(data)
            }
          }
        } catch {}
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
        // HRRR fetch failed — keep showing last cached data if available
        // Better to show slightly stale HRRR than bad Open-Meteo fallback data
        console.warn('Pipeline cloud fetch failed, using stale cache:', e.message)
        const stale = loadCache()
        if (stale) {
          setCloudData(stale)
          setPhase('done')
        } else {
          setError('Cloud data unavailable')
          setPhase('error')
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

  // Interpolate a single forecast series at a target time (ms)
  // Returns float cloud cover 0-100, or null if no data
  function interpForecast(fc, target) {
    if (!fc?.length) return null
    const sorted = [...fc].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    let before = null, after = null
    for (const p of sorted) {
      const t = new Date(p.time).getTime()
      if (t <= target) before = p
      else if (!after) after = p
    }
    if (!before) return after ? (after.cloudcover ?? after.cc ?? null) : null
    if (!after)  return before ? (before.cloudcover ?? before.cc ?? null) : null
    const t0 = new Date(before.time).getTime()
    const t1 = new Date(after.time).getTime()
    const frac = (target - t0) / (t1 - t0)
    const v0 = before.cloudcover ?? before.cc ?? 0
    const v1 = after.cloudcover  ?? after.cc  ?? 0
    return v0 + (v1 - v0) * frac
  }

  // Stable function reference — reads from ref so always uses latest data
  const getCloudAt = useCallback((lat, lon, hourOffset = 0) => {
    const data = cloudDataRef.current
    if (!data?.points) return null
    const spacing = data.spacing || GRID_SPACING
    const target  = Date.now() + hourOffset * 3600000

    // Bilinear interpolation across the 4 surrounding cloud grid points.
    // This eliminates the "bead" artifact caused by nearest-neighbor snapping
    // when the render grid (0.1°) is finer than the cloud grid (0.25°).
    const r  = v => parseFloat((Math.floor(v / spacing) * spacing).toFixed(2))
    const lat0 = r(lat),   lon0 = r(lon)
    const lat1 = parseFloat((lat0 + spacing).toFixed(2))
    const lon1 = parseFloat((lon0 + spacing).toFixed(2))
    const tx   = (lon - lon0) / spacing   // 0..1 fraction across cell
    const ty   = (lat - lat0) / spacing   // 0..1 fraction across cell

    const key = (la, lo) => {
      const rr = v => parseFloat((Math.round(v / spacing) * spacing).toFixed(2))
      return `${rr(la)},${rr(lo)}`
    }

    const v00 = interpForecast(data.points[key(lat0, lon0)], target)
    const v10 = interpForecast(data.points[key(lat1, lon0)], target)
    const v01 = interpForecast(data.points[key(lat0, lon1)], target)
    const v11 = interpForecast(data.points[key(lat1, lon1)], target)

    // Fall back to nearest-neighbor if fewer than 2 valid corners
    const valid = [v00, v10, v01, v11].filter(v => v !== null)
    if (valid.length === 0) return null
    if (valid.length < 2) return Math.round(valid[0])

    // Bilinear: interpolate along lon first, then lat
    // Use null corners as transparent (weight only valid corners)
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
    return weight > 0 ? Math.round(sum / weight) : null
  }, []) // stable — reads from ref

  const coverage = cloudData?.points ? Object.keys(cloudData.points).length : 0
  const total    = cloudData?.points ? Object.keys(cloudData.points).length : 0

  return { cloudData, loading, progress, error, getCloudAt, coverage, total, phase }
}

export async function fetchSpotForecast(lat, lon) {
  return fetchSinglePoint(lat, lon)
}
