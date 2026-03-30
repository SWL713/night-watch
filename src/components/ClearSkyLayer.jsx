import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

export default function ClearSkyLayer({ cloudData, getAvgCloudAt, windowHours = 8, onLongShot }) {
  const map = useMap()
  const canvasRef = useRef(null)

  const regionStats = useMemo(() => {
    if (!cloudData?.points) return null
    const keys = Object.keys(cloudData.points)
    const lats = keys.map(k => parseFloat(k.split(',')[0]))
    const lons  = keys.map(k => parseFloat(k.split(',')[1]))
    const bounds = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLon: Math.min(...lons), maxLon: Math.max(...lons),
    }

    const now = Date.now()
    const cutoff = now + windowHours * 3600000

    // Per-point stats using windowed forecast hours
    const pointStats = {}
    for (const k of keys) {
      const fc = cloudData.points[k]
      if (!fc?.length) continue
      const windowed = fc.filter(p => {
        const t = p.timeMs ?? new Date(p.time).getTime()
        return t >= now && t <= cutoff
      })
      const use = windowed.length > 0 ? windowed : fc
      // Median cloud cover — honest about typical hour, not skewed by extremes
      const vals = use.map(p => p.cloudcover ?? 0).sort((a, b) => a - b)
      const mid = Math.floor(vals.length / 2)
      const med = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
      // Count of hours below 40% — how many usable hours do you get
      const count = use.filter(p => (p.cloudcover ?? 100) < 40).length
      pointStats[k] = { med, count }
    }

    // Long Shot trigger: fewer than 5% of points have median ≤ 45
    const allMeds = Object.values(pointStats).map(p => p.med)
    const qualifying = allMeds.filter(m => m <= 45)
    const longShot = qualifying.length / allMeds.length < 0.05
    onLongShot?.(longShot)

    if (longShot) {
      // Long Shot: top 5th percentile by median within 150mi anchor zones
      const ANCHORS = [
        { lat: 42.9, lon: -78.9 }, { lat: 43.0, lon: -76.1 },
        { lat: 43.0, lon: -73.8 }, { lat: 44.5, lon: -73.2 },
        { lat: 42.4, lon: -71.1 }, { lat: 40.7, lon: -74.0 },
        { lat: 39.9, lon: -75.2 },
      ]
      const R = 150 / 69  // ~2.17 degrees
      const anchorThresholds = ANCHORS.map(anchor => {
        const nearby = keys
          .filter(k => {
            const [la, lo] = k.split(',').map(parseFloat)
            const d = Math.sqrt((la-anchor.lat)**2 + ((lo-anchor.lon)*Math.cos(anchor.lat*Math.PI/180))**2)
            return d <= R
          })
          .map(k => pointStats[k]?.med)
          .filter(v => v != null)
          .sort((a, b) => a - b)
        if (!nearby.length) return null
        return nearby[Math.floor(nearby.length * 0.05)]
      }).filter(v => v != null)

      return { bounds, pointStats, thresholds: { longShot: true, anchorThresholds } }
    }

    // Normal mode: bin by count of good hours within qualifying points
    const qualCounts = qualifying.length > 0
      ? Object.values(pointStats).filter(p => p.med <= 45).map(p => p.count).sort((a, b) => a - b)
      : []

    const cBest = qualCounts[Math.floor(qualCounts.length * 0.80)] ?? 4
    const cGood = qualCounts[Math.floor(qualCounts.length * 0.60)] ?? 2
    const cFair = qualCounts[Math.floor(qualCounts.length * 0.40)] ?? 1

    return {
      bounds, pointStats,
      thresholds: { longShot: false, medFloor: 45, cBest, cGood, cFair },
    }
  }, [cloudData, windowHours])

  useEffect(() => {
    if (!getAvgCloudAt || !regionStats) return
    const { bounds, thresholds } = regionStats
    const { longShot } = thresholds

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    const AA = 0.02
    const FADE = 0.8

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

          if (longShot) {
            // Long Shot: show top 5th percentile per anchor zone
            // Use min threshold across all anchors within 150mi
            const R = 150 / 69
            let lsThreshold = null
            for (const thresh of thresholds.anchorThresholds) {
              if (lsThreshold === null || thresh < lsThreshold) lsThreshold = thresh
            }
            if (lsThreshold === null || cf > lsThreshold + AA*100) continue
            const t = Math.max(0, Math.min(1, (lsThreshold + AA*100 - cf) / (2*AA*100)))
            const s = t * t * (3 - 2 * t)
            const alpha = Math.round(40 * s * edgeFade)
            if (alpha === 0) continue
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * W + px] = 1
          } else {
            // Normal mode: median gate + count-based color
            // cf from getAvgCloudAt is average — use as proxy for median gate
            if (cf > thresholds.medFloor) continue
            // Map cf to approximate hour count: lower cf = more good hours
            // Count bins: cBest/cGood/cFair are count thresholds from regionStats
            // We map cf ranges to count bins for smooth per-pixel rendering
            const cfBINS = [
              { maxCf: 15, alpha: 153 },  // BEST: very clear avg → many good hours
              { maxCf: 30, alpha: 95  },  // GOOD
              { maxCf: 45, alpha: 45  },  // FAIR
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
            if (alpha === 0) continue
            d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=Math.round(alpha * edgeFade)
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)

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


