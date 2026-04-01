/**
 * useSpaceWeatherHistory
 *
 * Lazy-fetches 7-day IMF/plasma history and EPAM data for the Space Weather tab.
 * Only fetches when `active` is true — does nothing while on other tabs.
 *
 * Returns parsed, ready-to-plot arrays. All timestamps are JS Date objects.
 * All fill values (-9999, -1e5, null) are stripped — gaps are represented as
 * missing array entries so the canvas renderer can draw hatched gap regions.
 *
 * Data files (written by pipeline every 15 min):
 *   data/sw_mag_7day.json     columns: [time, bx, by, bz, bt, phi]
 *   data/sw_plasma_7day.json  columns: [time, density, speed, temperature]
 *   data/sw_epam.json         columns: [time, e38, e175, p47, p68, p115, p310, p795, p1060]
 */

import { useState, useEffect, useRef } from 'react'

const BASE = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data'
const MAG_URL     = `${BASE}/sw_mag_7day.json`
const PLASMA_URL  = `${BASE}/sw_plasma_7day.json`
const EPAM_URL    = `${BASE}/sw_epam.json`

// Cache TTL: re-fetch at most once per 10 minutes per file
const TTL_MS = 10 * 60 * 1000

// Module-level cache so data persists across tab switches without re-fetching
const _cache = { mag: null, plasma: null, epam: null, fetchedAt: {} }

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Parse a column-array file into an array of typed objects.
 * Strips null values but preserves time gaps (null rows become missing entries).
 * @param {object} raw   - { columns: [...], data: [[...], ...] }
 * @param {string[]} keep - which column names to include (all if omitted)
 * @returns {object[]} array of { time: Date, [col]: number|null, ... }
 */
function parseColumnFile(raw, keep) {
  if (!raw?.columns || !raw?.data) return []
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
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    // Check if cached data is still fresh
    const now = Date.now()
    const magFresh    = _cache.mag    && (now - (_cache.fetchedAt.mag    || 0)) < TTL_MS
    const plasmaFresh = _cache.plasma && (now - (_cache.fetchedAt.plasma || 0)) < TTL_MS
    const epamFresh   = _cache.epam   && (now - (_cache.fetchedAt.epam   || 0)) < TTL_MS

    if (magFresh && plasmaFresh && epamFresh) {
      setMag(_cache.mag)
      setPlasma(_cache.plasma)
      setEpam(_cache.epam)
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true

    setLoading(true)
    setError(null)

    const fetchAll = async () => {
      try {
        const [magRaw, plasmaRaw, epamRaw] = await Promise.all([
          magFresh    ? Promise.resolve(null) : fetchJson(MAG_URL),
          plasmaFresh ? Promise.resolve(null) : fetchJson(PLASMA_URL),
          epamFresh   ? Promise.resolve(null) : fetchJson(EPAM_URL),
        ])

        if (magRaw) {
          const parsed = parseColumnFile(magRaw, ['bx', 'by', 'bz', 'bt', 'phi'])
          _cache.mag = parsed
          _cache.fetchedAt.mag = Date.now()
          setMag(parsed)
        }

        if (plasmaRaw) {
          const parsed = parseColumnFile(plasmaRaw, ['density', 'speed', 'temperature'])
          _cache.plasma = parsed
          _cache.fetchedAt.plasma = Date.now()
          setPlasma(parsed)
        }

        if (epamRaw) {
          const parsed = parseColumnFile(epamRaw, ['e38', 'e175', 'p47', 'p68', 'p115', 'p310', 'p795', 'p1060'])
          _cache.epam = parsed
          _cache.fetchedAt.epam = Date.now()
          setEpam(parsed)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
        fetchedRef.current = false
      }
    }

    fetchAll()
  }, [active])

  return { mag, plasma, epam, loading, error }
}
