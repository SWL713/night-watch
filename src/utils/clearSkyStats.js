import { useMemo } from 'react'

function windowForecasts(forecasts, hours) {
  if (!forecasts?.length) return forecasts
  const now = Date.now()
  const cutoff = now + hours * 3600000
  const future = forecasts.filter(p => {
    const t = new Date(p.time).getTime()
    return t >= now && t <= cutoff
  })
  return future.length > 0 ? future : forecasts
}

export function useClearSkyStats(cloudData, windowHours = 8) {
  return useMemo(() => {
    if (!cloudData?.points) return { longShot: false }
    const keys = Object.keys(cloudData.points)
    const meds = keys.map(k => {
      const fc = windowForecasts(cloudData.points[k], windowHours)
      if (!fc?.length) return null
      const vals = fc.map(p => p.cloudcover ?? 0).sort((a, b) => a - b)
      const mid = Math.floor(vals.length / 2)
      return vals.length % 2 ? vals[mid] : (vals[mid-1] + vals[mid]) / 2
    }).filter(v => v !== null)
    const qualifying = meds.filter(m => m <= 45).length
    return { longShot: qualifying / meds.length < 0.05 }
  }, [cloudData, windowHours])
}
