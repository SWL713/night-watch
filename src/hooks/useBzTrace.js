// Fetches real-time L1 data from NOAA for the timeline trace.
// Mag (Bz) and plasma (V, density) are fetched independently and
// returned as separate arrays — no timestamp merge required.

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
  const [trace,        setTrace]        = useState([])  // [{time, bz}]
  const [plasmaTrace,  setPlasmaTrace]  = useState([])  // [{time, speed, density}]
  const [loading,      setLoading]      = useState(true)

  async function fetchTrace() {
    const now    = new Date()
    // Fetch 2hrs back so that after shifting by ~40min transit lag
    // we still have a full 1hr of data visible on the Earth-time axis.
    const cutoff = new Date(now.getTime() - 120 * 60000)

    const [magData, plasmaData] = await Promise.all([
      fetchWithProxy(DSCOVR_MAG).then(d => d?.length ? d : fetchWithProxy(WIND_MAG)),
      fetchWithProxy(DSCOVR_PLASMA),
    ])

    // ── Bz trace ─────────────────────────────────────────────────────────────
    if (magData?.length) {
      const bzPoints = magData
        .map(r => {
          if (!r.time_tag) return null
          const bz = r.bz_gsm ?? r.Bz ?? r.bz ?? null
          if (bz === null) return null
          return { time: new Date(r.time_tag + 'Z'), bz: parseFloat(bz) }
        })
        .filter(p => p && p.time >= cutoff)
        .sort((a, b) => a.time - b.time)
      setTrace(bzPoints)
    }

    // ── Plasma trace (V, density) — completely independent ───────────────────
    if (plasmaData?.length) {
      const pPoints = plasmaData
        .map(r => {
          if (!r.time_tag) return null
          const speed   = r.proton_speed   ?? r.speed   ?? r.V   ?? null
          const density = r.proton_density ?? r.density ?? r.Np  ?? null
          if (speed === null && density === null) return null
          return {
            time:    new Date(r.time_tag + 'Z'),
            speed:   speed   != null ? parseFloat(speed)   : null,
            density: density != null ? parseFloat(density) : null,
          }
        })
        .filter(p => p && p.time >= cutoff)
        .sort((a, b) => a.time - b.time)
      setPlasmaTrace(pPoints)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchTrace()
    const iv = setInterval(fetchTrace, 2 * 60000)
    return () => clearInterval(iv)
  }, [])

  return { trace, plasmaTrace, loading }
}
