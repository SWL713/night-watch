// Fetches real-time Bz data directly from NOAA for the timeline trace
// This gives minute-by-minute resolution for the past hour
// rather than relying on the hourly pipeline

import { useState, useEffect } from 'react'

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${url}`,
  url => `https://api.allorigins.win/raw?url=${url}`,
]

const DSCOVR_MAG   = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
const WIND_MAG     = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'

async function fetchWithProxy(url) {
  // Try direct first (sometimes works)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (r.ok) return await r.json()
  } catch {}

  // Try CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (r.ok) return await r.json()
    } catch {}
  }
  return null
}

export function useBzTrace() {
  const [trace, setTrace] = useState([])   // [{time: Date, bz: number}]
  const [loading, setLoading] = useState(true)

  async function fetchTrace() {
    // Try DSCOVR first, fall back to WIND
    let data = await fetchWithProxy(DSCOVR_MAG)
    if (!data?.length) data = await fetchWithProxy(WIND_MAG)
    if (!data?.length) { setLoading(false); return }

    const now = new Date()
    const cutoff = new Date(now.getTime() - 75 * 60000)  // 75 min back

    const points = data
      .map(r => ({
        time: new Date(r.time_tag + 'Z'),
        bz: r.bz_gsm ?? r.Bz ?? r.bz ?? null,
      }))
      .filter(p => p.bz !== null && p.time >= cutoff && p.time <= now)
      .sort((a, b) => a.time - b.time)

    setTrace(points)
    setLoading(false)
  }

  useEffect(() => {
    fetchTrace()
    // Refresh every 2 minutes
    const iv = setInterval(fetchTrace, 2 * 60000)
    return () => clearInterval(iv)
  }, [])

  return { trace, loading }
}
