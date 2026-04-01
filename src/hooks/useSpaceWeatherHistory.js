/**
 * useSpaceWeatherHistory
 *
 * Lazy-fetches 7-day space weather history for the Space Weather tab.
 * Only fetches when `active` is true.
 *
 * Data files (written by pipeline every 15-30 min):
 *   sw_mag_7day.json     columns: [time, bx, by, bz, bt, phi]
 *   sw_plasma_7day.json  columns: [time, density, speed, temperature]
 *   sw_epam.json         columns: [time, e38, e175, p47, p68, p115, p310, p795, p1060]
 *   sw_stereo_a.json     columns: [time, bn, bt_tot, br, bt_tan, speed, density]  RTN coords
 *   sw_goes_mag.json     columns: [time, e_hp, e_he, e_hn, e_ht, w_hp, w_he, w_hn, w_ht]
 */

import { useState, useEffect, useRef } from 'react'

const BASE       = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data'
const MAG_URL    = `${BASE}/sw_mag_7day.json`
const PLASMA_URL = `${BASE}/sw_plasma_7day.json`
const EPAM_URL   = `${BASE}/sw_epam.json`
const STEREO_URL = `${BASE}/sw_stereo_a.json`
const GOES_URL   = `${BASE}/sw_goes_mag.json`

const TTL_MS = 10 * 60 * 1000

const _cache = {
  mag: null, plasma: null, epam: null, stereo: null, goes: null,
  fetchedAt: {}
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchJsonSoft(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.json()
  } catch (_) { return null }
}

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
  const [goes,   setGoes]   = useState(_cache.goes)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!active) return
    const now = Date.now()
    const fresh = key => _cache[key] !== null && (now - (_cache.fetchedAt[key] || 0)) < TTL_MS

    if (fresh('mag') && fresh('plasma') && fresh('epam') && fresh('stereo') && fresh('goes')) {
      setMag(_cache.mag); setPlasma(_cache.plasma); setEpam(_cache.epam)
      setStereo(_cache.stereo); setGoes(_cache.goes)
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true); setError(null)

    const fetchAll = async () => {
      try {
        const [magRaw, plasmaRaw, epamRaw, stereoRaw, goesRaw] = await Promise.all([
          fresh('mag')    ? Promise.resolve(null) : fetchJson(MAG_URL),
          fresh('plasma') ? Promise.resolve(null) : fetchJson(PLASMA_URL),
          fresh('epam')   ? Promise.resolve(null) : fetchJson(EPAM_URL),
          fresh('stereo') ? Promise.resolve(null) : fetchJsonSoft(STEREO_URL),
          fresh('goes')   ? Promise.resolve(null) : fetchJsonSoft(GOES_URL),
        ])

        const store = (key, raw, cols, setter) => {
          const val = raw ? parseColumnFile(raw, cols) : []
          _cache[key] = val; _cache.fetchedAt[key] = Date.now(); setter(val)
        }

        if (magRaw)    store('mag',    magRaw,    ['bx','by','bz','bt','phi'],                              setMag)
        if (plasmaRaw) store('plasma', plasmaRaw, ['density','speed','temperature'],                        setPlasma)
        if (epamRaw)   store('epam',   epamRaw,   ['e38','e175','p47','p68','p115','p310','p795','p1060'],   setEpam)
        store('stereo', stereoRaw, ['bn','bt_tot','br','bt_tan','speed','density'],                         setStereo)
        store('goes',   goesRaw,   ['e_hp','e_he','e_hn','e_ht','w_hp','w_he','w_hn','w_ht'],               setGoes)

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false); fetchedRef.current = false
      }
    }

    fetchAll()
  }, [active])

  return { mag, plasma, epam, stereo, goes, loading, error }
}
