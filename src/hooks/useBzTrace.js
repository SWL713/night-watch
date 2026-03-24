// Fetches real-time Bz, V, and density from NOAA for the timeline trace
// Minute-by-minute resolution for the past ~75 minutes
// Merges mag (Bz) and plasma (V, density) feeds by timestamp

import { useState, useEffect } from 'react'

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${url}`,
  url => `https://api.allorigins.win/raw?url=${url}`,
]

const DSCOVR_MAG    = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
const WIND_MAG      = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'
const DSCOVR_PLASMA = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json'

async function fetchWithProxy(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (r.ok) return await r.json()
  } catch {}
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (r.ok) return await r.json()
    } catch {}
  }
  return null
}

export function useBzTrace() {
  const [trace, setTrace] = useState([])   // [{time, bz, speed, density}]
  const [loading, setLoading] = useState(true)

  async function fetchTrace() {
    const [magData, plasmaData] = await Promise.all([
      fetchWithProxy(DSCOVR_MAG).then(d => d?.length ? d : fetchWithProxy(WIND_MAG)),
      fetchWithProxy(DSCOVR_PLASMA),
    ])

    if (!magData?.length) { setLoading(false); return }

    const now    = new Date()
    const cutoff = new Date(now.getTime() - 75 * 60000)

    // Build plasma map keyed by minute (round to nearest minute)
    const plasmaMap = new Map()
    if (plasmaData?.length) {
      for (const r of plasmaData) {
        if (!r.time_tag) continue
        const t = new Date(r.time_tag + 'Z')
        // Key = minute bucket
        const key = Math.round(t.getTime() / 60000)
        plasmaMap.set(key, {
          speed:   r.proton_speed   ?? r.speed   ?? r.V  ?? null,
          density: r.proton_density ?? r.density  ?? r.Np ?? null,
        })
      }
    }

    const points = magData
      .map(r => {
        if (!r.time_tag) return null
        const t   = new Date(r.time_tag + 'Z')
        const key = Math.round(t.getTime() / 60000)
        const pl  = plasmaMap.get(key) || plasmaMap.get(key - 1) || plasmaMap.get(key + 1) || {}
        return {
          time:    t,
          bz:      r.bz_gsm ?? r.Bz ?? r.bz ?? null,
          speed:   pl.speed   != null ? parseFloat(pl.speed)   : null,
          density: pl.density != null ? parseFloat(pl.density) : null,
        }
      })
      .filter(p => p && p.bz !== null && p.time >= cutoff)
      .sort((a, b) => a.time - b.time)

    setTrace(points)
    setLoading(false)
  }

  useEffect(() => {
    fetchTrace()
    const iv = setInterval(fetchTrace, 2 * 60000)
    return () => clearInterval(iv)
  }, [])

  return { trace, loading }
}
