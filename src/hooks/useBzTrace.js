// Fetches real-time L1 data from NOAA for the timeline trace.
// Bz: minute-by-minute from NOAA mag feed via CORS proxy
// V/density: from space_weather.json plasma_timeline (pipeline-sourced, no CORS needed)
//            with direct NOAA WIND fetch as enhancement if available

import { useState, useEffect } from 'react'

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${url}`,
  url => `https://api.allorigins.win/raw?url=${url}`,
]

const DSCOVR_MAG = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
const WIND_MAG   = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'
// NOTE: rtsw_plasma_1m.json was removed by NOAA (404). WIND carries plasma too.
const WIND_URL   = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'

// Valid ranges for fill-value filtering
const SPEED_MIN = 200, SPEED_MAX = 3000
const DENS_MIN  = 0.5, DENS_MAX  = 200  // <0.5 = WIND sensor gap/fill value

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

function validSpeed(v)   { const n = parseFloat(v); return isFinite(n) && n >= SPEED_MIN && n <= SPEED_MAX ? n : null }
function validDensity(d) { const n = parseFloat(d); return isFinite(n) && n >= DENS_MIN  && n <= DENS_MAX  ? n : null }

export function useBzTrace() {
  const [trace,       setTrace]       = useState([])  // [{time, bz}]
  const [plasmaTrace, setPlasmaTrace] = useState([])  // [{time, speed, density}]
  const [loading,     setLoading]     = useState(true)

  async function fetchTrace() {
    const now    = new Date()
    const cutoff = new Date(now.getTime() - 120 * 60000)  // 2hrs back

    // Bz — DSCOVR mag primary, WIND mag fallback
    const magData = await fetchWithProxy(DSCOVR_MAG)
      .then(d => d?.length ? d : fetchWithProxy(WIND_MAG))

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

    // Plasma — WIND carries proton_speed and proton_density in same feed as mag
    // No separate plasma endpoint needed (rtsw_plasma_1m.json was removed by NOAA)
    const plasmaData = await fetchWithProxy(WIND_URL)
    if (plasmaData?.length) {
      const pPoints = plasmaData
        .map(r => {
          if (!r.time_tag) return null
          const speed   = validSpeed(r.proton_speed   ?? r.speed   ?? r.V)
          const density = validDensity(r.proton_density ?? r.density ?? r.Np)
          if (speed === null && density === null) return null
          return { time: new Date(r.time_tag + 'Z'), speed, density }
        })
        .filter(p => p && p.time >= cutoff)
        .sort((a, b) => a.time - b.time)

      if (pPoints.length >= 5) {
        setPlasmaTrace(pPoints)
        setLoading(false)
        return
      }
    }

    // Signal null so TimelineBar uses spaceWeather.plasma_timeline (pipeline data)
    setPlasmaTrace(null)
    setLoading(false)
  }

  useEffect(() => {
    fetchTrace()
    const iv = setInterval(fetchTrace, 2 * 60000)
    return () => clearInterval(iv)
  }, [])

  return { trace, plasmaTrace, loading }
}
