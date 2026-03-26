import { useState, useEffect } from 'react'
import { SPACE_WEATHER_URL } from '../config.js'

const FALLBACK = {
  state: 'QUIET',
  g_level: '',
  g_label: '',
  hss_active: false,
  hss_watch: false,
  intensity_label: 'Calm',
  intensity_color: '#667788',
  bz_now: 0,
  speed_kms: 450,
  density_ncc: 5,
  dst_nT: 0,
  aurora_quality: 'POOR',
  aurora_quality_color: '#ff5566',
  moon_illumination: 0,
  moon_phase_index: 1,
  moon_phase_name: 'new',
  moon_phase_label: 'New Moon',
  moon_rise: null,
  moon_set: null,
  timeline: [],
  enlil_active: false,
  enlil_timeline: [],
  last_updated: null,
}

export function useSpaceWeather() {
  const [data, setData] = useState(FALLBACK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(SPACE_WEATHER_URL + '?t=' + Date.now())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData({ ...FALLBACK, ...json })
        setError(null)
      } catch (e) {
        console.warn('Space weather fetch failed, using fallback:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Refresh every 15 minutes matching pipeline cadence
    const interval = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
