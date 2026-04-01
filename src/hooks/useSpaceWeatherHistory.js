/**
 * useSpaceWeatherHistory
 *
 * Lazy-fetches 7-day IMF/plasma history, EPAM, and STEREO-A data.
 * Only fetches when `active` is true — does nothing while on other tabs.
 *
 * Data files (written by pipeline every 15 min):
 *   data/sw_mag_7day.json     columns: [time, bx, by, bz, bt, phi]
 *   data/sw_plasma_7day.json  columns: [time, density, speed, temperature]
 *   data/sw_epam.json         columns: [time, e38, e175, p47, p68, p115, p310, p795, p1060]
 *   data/sw_stereo_a.json     columns: [time, bz, bt, bx, by, speed, density]
 */

import { useState, useEffect, useRef } from 'react'

const BASE       = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data'
const MAG_URL    = `${BASE}/sw_mag_7day.json`
const PLASMA_URL = `${BASE}/sw_plasma_7day.json`
const EPAM_URL   = `${BASE}/sw_epam.json`
const STEREO_URL = `${BASE}/sw_stereo_a.json`

const TTL_MS = 10 * 60 * 1000

// Module-level cache persists across tab switches
const _cache = {
  mag: null, plasma: null, epam: null, stereo: null,
  fetchedAt: {}
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Fetch without throwing on 404 — STEREO-A file may not exist on first pipeline run
async function fetchJsonSoft(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.json()
  } catch (_) {
    return null
  }
}

/**
 * Parse a column-array file into an array of typed objects.
 * { columns: [...], data: [[...], ...] } -> [{ time: Date, col: number|null, ... }]
 */
function parseColumnFile(raw, keep) {
  if (!raw || !raw.columns || !raw.data) return []
  const cols = raw.columns
  const ti = cols.indexOf('time')
  if (ti === -1) return []

  const wanted = keep || cols.filter(c => c !== 'time')
  const indices = wanted.map(c => cols.indexOf(c))

  return raw.data.reduce((acc, row) => {
    try {
      const t = new Date(row[ti])
      if (isNaN(t.getTime())) return acc
      const pt = { time: t }
      wanted.forEach((col, i) => {
        const idx = indices[i]
        const v = idx >= 0 ? row[idx] : null
        pt[col] = (v !== null && v !== undefined && !isNaN(v)) ? v : null
      })
      acc.push(pt)
    } catch (_) {}
    return acc
  }, [])
}

export function useSpaceWeatherHistory(active) {
  const [mag,    setMag]    = useState(_cache.mag)
  const [plasma, setPlasma] = useState(_cache.plasma)
  const [epam,   setEpam]   = useState(_cache.epam)
  const [stereo, setStereo] = useState(_cache.stereo)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    const now = Date.now()
    const fresh = key => _cache[key] !== null && (now - (_cache.fetchedAt[key] || 0)) < TTL_MS

    if (fresh('mag') && fresh('plasma') && fresh('epam') && fresh('stereo')) {
      setMag(_cache.mag)
      setPlasma(_cache.plasma)
      setEpam(_cache.epam)
      setStereo(_cache.stereo)
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    setError(null)

    const fetchAll = async () => {
      try {
        const [magRaw, plasmaRaw, epamRaw, stereoRaw] = await Promise.all([
          fresh('mag')    ? Promise.resolve(null) : fetchJson(MAG_URL),
          fresh('plasma') ? Promise.resolve(null) : fetchJson(PLASMA_URL),
          fresh('epam')   ? Promise.resolve(null) : fetchJson(EPAM_URL),
          fresh('stereo') ? Promise.resolve(null) : fetchJsonSoft(STEREO_URL),
        ])

        if (magRaw) {
          const p = parseColumnFile(magRaw, ['bx', 'by', 'bz', 'bt', 'phi'])
          _cache.mag = p; _cache.fetchedAt.mag = Date.now(); setMag(p)
        }
        if (plasmaRaw) {
          const p = parseColumnFile(plasmaRaw, ['density', 'speed', 'temperature'])
          _cache.plasma = p; _cache.fetchedAt.plasma = Date.now(); setPlasma(p)
        }
        if (epamRaw) {
          const p = parseColumnFile(epamRaw, ['e38', 'e175', 'p47', 'p68', 'p115', 'p310', 'p795', 'p1060'])
          _cache.epam = p; _cache.fetchedAt.epam = Date.now(); setEpam(p)
        }
        // STEREO-A: soft fetch — null if file doesn't exist yet
        const stereoVal = stereoRaw
          ? parseColumnFile(stereoRaw, ['bz', 'bt', 'bx', 'by', 'speed', 'density'])
          : []
        _cache.stereo = stereoVal; _cache.fetchedAt.stereo = Date.now(); setStereo(stereoVal)

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
        fetchedRef.current = false
      }
    }

    fetchAll()
  }, [active])

  return { mag, plasma, epam, stereo, loading, error }
}
