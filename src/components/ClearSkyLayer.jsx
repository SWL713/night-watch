import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// ── Constants ─────────────────────────────────────────────────────────────────

// 150-mile radius anchor points for Long Shot sub-region detection
// Long Shot fires globally but zones are found per anchor to avoid
// painting the whole region when one distant area is clear
const ANCHORS = [
  { name: 'Buffalo',      lat: 42.9, lon: -78.9 },
  { name: 'Syracuse',     lat: 43.0, lon: -76.1 },
  { name: 'Albany',       lat: 43.0, lon: -73.8 },
  { name: 'Burlington',   lat: 44.5, lon: -73.2 },
  { name: 'Boston',       lat: 42.4, lon: -71.1 },
  { name: 'NYC',          lat: 40.7, lon: -74.0 },
  { name: 'Philadelphia', lat: 39.9, lon: -75.2 },
]
const ANCHOR_RADIUS_DEG = 150 / 69  // ~2.17° lat (~150 miles)

// Median cloud cover for a forecast array
function median(forecasts) {
  if (!forecasts?.length) return null
  const vals = forecasts.map(p => p.cloudcover ?? 0).sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

// Count of forecast hours below threshold
function hoursBelow(forecasts, threshold = 40) {
  if (!forecasts?.length) return 0
  return forecasts.filter(p => (p.cloudcover ?? 100) < threshold).length
}

// Haversine distance in degrees (approximate, good enough for 150mi radius)
function distDeg(lat1, lon1, lat2, lon2) {
  const dlat = lat2 - lat1
  const dlon = (lon2 - lon1) * Math.cos((lat1 + lat2) * Math.PI / 360)
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

// ── Region stats ───────────────────────────────────────────────────────────────

export default function ClearSkyLayer({ cloudData, getAvgCloudAt }) {
  const map = useMap()
  const canvasRef = useRef(null)

  const regionStats = useMemo(() => {
    if (!cloudData?.points) return null
    const keys = Object.keys(cloudData.points)

    // Bounds for edge fade
    const lats = keys.map(k => parseFloat(k.split(',')[0]))
    const lons  = keys.map(k => parseFloat(k.split(',')[1]))
    const bounds = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLon: Math.min(...lons), maxLon: Math.max(...lons),
    }

    // Compute median and hourCount per grid point
    const pointStats = {}
    for (const k of keys) {
      const fc = cloudData.points[k]
      if (!fc?.length) continue
      pointStats[k] = {
        med: median(fc),
        count: hoursBelow(fc, 40),
      }
    }

    // Global Long Shot trigger: fewer than 5% of points have median ≤ 45
    const allMeds = Object.values(pointStats).map(p => p.med).filter(v => v !== null)
    allMeds.sort((a, b) => a - b)
    const qualifyingCount = allMeds.filter(m => m <= 45).length
    const longShot = qualifyingCount / allMeds.length < 0.05

    // Per-anchor 5th percentile threshold for Long Shot zones
    // Only computed when longShot is true
    let anchorThresholds = []
    if (longShot) {
      for (const anchor of ANCHORS) {
        const nearbyMeds = keys
          .filter(k => {
            const [lat, lon] = k.split(',').map(parseFloat)
            return distDeg(lat, lon, anchor.lat, anchor.lon) <= ANCHOR_RADIUS_DEG
          })
          .map(k => pointStats[k]?.med)
          .filter(v => v !== null)
          .sort((a, b) => a - b)
        if (!nearbyMeds.length) continue
        const p05 = nearbyMeds[Math.floor(nearbyMeds.length * 0.05)]
        anchorThresholds.push({ anchor, p05 })
      }
    }

    // Normal mode: relative percentile bins within qualifying points
    const qualPoints = Object.entries(pointStats).filter(([, v]) => v.med <= 45)
    let thresholds = { best: 0, good: 0, fair: 45, longShot }

    if (qualPoints.length > 0) {
      const counts = qualPoints.map(([, v]) => v.count).sort((a, b) => a - b)
      // Bin by count of good hours — BEST=top 20%, GOOD=20-40%, FAIR=40-60%
      thresholds = {
        best:     counts[Math.floor(counts.length * 0.80)],
        good:     counts[Math.floor(counts.length * 0.60)],
        fair:     counts[Math.floor(counts.length * 0.40)],
        medFloor: 45,
        longShot,
        anchorThresholds,
      }
    }

    return { bounds, pointStats, thresholds }
  }, [cloudData])

  useEffect(() => {
    if (!getAvgCloudAt || !regionStats) return

    const { bounds, thresholds } = regionStats
    const { longShot, anchorThresholds } = thresholds

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    const AA = 0.02
    const FADE = 0.8

    // Precompute per-pixel Long Shot threshold: min p05 across all anchors
    // within 150mi of that pixel — avoids per-pixel anchor loop
    function getLongShotThreshold(lat, lon) {
      if (!anchorThresholds?.length) return null
      let best = null
      for (const { anchor, p05 } of anchorThresholds) {
        if (distDeg(lat, lon, anchor.lat, anchor.lon) <= ANCHOR_RADIUS_DEG) {
          if (best === null || p05 < best) best = p05
        }
      }
      return best
    }

    function redraw() {
      if (!canvasRef.current) return
      const size = map.getSize()
      const dpr  = Math.min(window.devicePixelRatio || 1, 3)
      const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)
      canvas.width = W; canvas.height = H
      canvas.style.width  = size.x + 'px'
      canvas.style.height = size.y + 'px'
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)
      const imageData = ctx.createImageData(W, H)
      const d = imageData.data
      const lsPixels = longShot ? new Uint8Array(W * H) : null

      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const ll = map.containerPointToLatLng([px / dpr, py / dpr])
          const { lat, lng: lon } = ll
          if (lat < bounds.minLat || lat > bounds.maxLat ||
              lon < bounds.minLon || lon > bounds.maxLon) continue

          const cf = getAvgCloudAt(lat, lon)
          if (cf === null) continue

          const edgeDist = Math.min(
            lat - bounds.minLat, bounds.maxLat - lat,
            lon - bounds.minLon, bounds.maxLon - lon
          )
          const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)
          const idx = (py * W + px) * 4

          // Try normal bins first — median gate + count-based color
          // Use getAvgCloudAt as proxy for median (both measure typical cloudiness)
          if (cf <= thresholds.medFloor ?? 45) {
            // Map to approximate count via cf value — lower cf = more good hours
            const BINS = [
              { threshold: thresholds.best, alpha: 153 },
              { threshold: thresholds.good, alpha: 95  },
              { threshold: thresholds.fair, alpha: 45  },
            ]
            // Convert count thresholds back to cf equivalents for per-pixel rendering
            // cf ≤ 20 → likely BEST count, cf ≤ 35 → GOOD, cf ≤ 45 → FAIR
            const cfBINS = [
              { maxCf: 20, alpha: 153 },
              { maxCf: 35, alpha: 95  },
              { maxCf: 45, alpha: 45  },
            ]
            let alpha = 0
            for (const bin of cfBINS) {
              const lo = bin.maxCf - AA * 100
              const hi = bin.maxCf + AA * 100
              if (cf > hi) continue
              if (cf <= lo) { alpha = bin.alpha; break }
              const t = (hi - cf) / (2 * AA * 100)
              const s = t * t * (3 - 2 * t)
              alpha = Math.round(alpha + (bin.alpha - alpha) * s)
              break
            }
            if (alpha > 0) {
              d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=Math.round(alpha * edgeFade)
              continue
            }
          }

          // Long Shot zones — only where no normal zone exists
          // and only within 150mi of an anchor that has qualifying points
          if (longShot) {
            const lsThreshold = getLongShotThreshold(lat, lon)
            if (lsThreshold === null) continue
            if (cf > lsThreshold + AA * 100) continue
            const t = Math.max(0, Math.min(1, (lsThreshold + AA*100 - cf) / (2*AA*100)))
            const s = t * t * (3 - 2 * t)
            const alpha = Math.round(40 * s * edgeFade)
            if (alpha === 0) continue
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * W + px] = 1
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)

      // Dashed orange border around Long Shot zones
      if (longShot && lsPixels) {
        ctx.strokeStyle = 'rgba(255,140,0,0.85)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        for (let py = 1; py < H - 1; py++) {
          for (let px = 1; px < W - 1; px++) {
            if (!lsPixels[py * W + px]) continue
            if (!lsPixels[(py-1)*W+px] || !lsPixels[(py+1)*W+px] ||
                !lsPixels[py*W+px-1]   || !lsPixels[py*W+px+1]) {
              ctx.rect(px, py, 1, 1)
            }
          }
        }
        ctx.stroke()
      }
    }

    redraw()
    map.on('moveend zoomend resize', redraw)

    return () => {
      map.off('moveend zoomend resize', redraw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [map, getAvgCloudAt, regionStats])

  return null
}

// Export long shot status for App.jsx banner
export function useClearSkyStats(cloudData) {
  return useMemo(() => {
    if (!cloudData?.points) return { longShot: false }
    const keys = Object.keys(cloudData.points)
    const meds = keys.map(k => {
      const fc = cloudData.points[k]
      if (!fc?.length) return null
      const vals = fc.map(p => p.cloudcover ?? 0).sort((a, b) => a - b)
      const mid = Math.floor(vals.length / 2)
      return vals.length % 2 ? vals[mid] : (vals[mid-1] + vals[mid]) / 2
    }).filter(v => v !== null)
    const qualifying = meds.filter(m => m <= 45).length
    return { longShot: qualifying / meds.length < 0.05 }
  }, [cloudData])
}

// Exported for SpotPins to get 8h avg cloud at a specific location
export function getAvgCloudForSpot(cloudData, lat, lon) {
  if (!cloudData?.points) return null
  const spacing = cloudData.spacing || 0.1
  const la0 = parseFloat((Math.round(lat / spacing) * spacing).toFixed(1))
  const lo0 = parseFloat((Math.round(lon / spacing) * spacing).toFixed(1))
  const key = `${la0.toFixed(1)},${lo0.toFixed(1)}`
  const forecasts = cloudData.points[key]
  if (!forecasts?.length) return null
  return forecasts.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / forecasts.length
}
