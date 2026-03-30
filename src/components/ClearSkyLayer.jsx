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
      // Windowed avg for per-pixel rendering — matches the threshold data
      const avg = use.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / use.length
      pointStats[k] = { med, count, avg }
    }

    // Long Shot evaluated per-anchor after anchor thresholds computed
    // Global longShot = true only if ALL anchors are in Long Shot mode
    // (used for banner/key display only — rendering is per-anchor)

    // Per-anchor thresholds for both normal and Long Shot mode
    const ANCHORS = [
      { lat: 42.9, lon: -78.9 }, { lat: 43.0, lon: -76.1 },
      { lat: 43.0, lon: -73.8 }, { lat: 44.5, lon: -73.2 },
      { lat: 42.4, lon: -71.1 }, { lat: 40.7, lon: -74.0 },
      { lat: 39.9, lon: -75.2 },
    ]
    const R = 150 / 69

    const anchorThresholds = ANCHORS.map(anchor => {
      const nearby = keys.filter(k => {
        const [la, lo] = k.split(',').map(parseFloat)
        const d = Math.sqrt((la-anchor.lat)**2 + ((lo-anchor.lon)*Math.cos(anchor.lat*Math.PI/180))**2)
        return d <= R
      })
      const meds = nearby.map(k => pointStats[k]?.med).filter(v => v != null).sort((a, b) => a - b)
      if (!meds.length) return null
      const qualCount = meds.filter(m => m <= 45).length
      const anchorLongShot = qualCount / meds.length < 0.05
      return {
        lat: anchor.lat, lon: anchor.lon,
        longShot: anchorLongShot,
        // Normal mode: relative percentile thresholds within this anchor's region
        p20: meds[Math.floor(meds.length * 0.20)],
        p40: meds[Math.floor(meds.length * 0.40)],
        p60: Math.min(meds[Math.floor(meds.length * 0.60)], 45),
        // Long Shot: top 5th percentile within this anchor's region
        p05: meds[Math.floor(meds.length * 0.05)],
      }
    }).filter(v => v != null)

    // Global longShot = all anchors in Long Shot — drives banner/key display
    const globalLongShot = anchorThresholds.every(a => a.longShot)
    onLongShot?.(globalLongShot)
    return { bounds, pointStats, thresholds: { longShot: globalLongShot, anchorThresholds } }
  }, [cloudData, windowHours])

  useEffect(() => {
    if (!getAvgCloudAt || !regionStats) return
    const { bounds, thresholds, pointStats } = regionStats
    const { longShot, anchorThresholds } = thresholds
    const spacing = cloudData?.spacing || 0.1

    // Fast windowed avg lookup — snaps lat/lon to nearest grid point
    function getWindowedAvg(lat, lon) {
      const la0 = parseFloat((Math.round(lat / spacing) * spacing).toFixed(1))
      const lo0 = parseFloat((Math.round(lon / spacing) * spacing).toFixed(1))
      return pointStats[`${la0.toFixed(1)},${lo0.toFixed(1)}`]?.avg ?? null
    }

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:201;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    const AA = 0.015
    const FADE = 0.5

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

          // Use windowed avg matching threshold data (fixes 4H vs 8H mismatch)
          const cf = getWindowedAvg(lat, lon) ?? getAvgCloudAt(lat, lon)
          if (cf === null) continue

          const edgeDist = Math.min(
            lat - bounds.minLat, bounds.maxLat - lat,
            lon - bounds.minLon, bounds.maxLon - lon
          )
          const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)
          const idx = (py * W + px) * 4

          const R = 150 / 69
          const BLEND = 30 / 69  // 30-mile soft blend zone at anchor edges

          // Normal mode scoring — always evaluated first, always wins
          // Distance-weighted blend across overlapping anchors — no hard circle edges
          let totalWeight = 0, weightedAlpha = 0
          for (const a of anchorThresholds) {
            const dist = Math.sqrt((lat-a.lat)**2 + ((lon-a.lon)*Math.cos(a.lat*Math.PI/180))**2)
            if (dist > R) continue
            if (cf > a.p60) continue
            // Weight: full weight inside (R-BLEND), tapers to 0 at R
            const weight = dist < R - BLEND ? 1 : Math.max(0, (R - dist) / BLEND)
            if (weight <= 0) continue
            const cfBINS = [
              { maxCf: a.p20, alpha: 153 },
              { maxCf: a.p40, alpha: 95  },
              { maxCf: a.p60, alpha: 45  },
            ]
            let aAlpha = 0
            for (const bin of cfBINS) {
              const lo = bin.maxCf - AA*100
              const hi = bin.maxCf + AA*100
              if (cf > hi) continue
              if (cf <= lo) { aAlpha = bin.alpha; break }
              const t = (hi - cf) / (2*AA*100)
              const s = t * t * (3 - 2*t)
              aAlpha = Math.round(aAlpha + (bin.alpha - aAlpha) * s)
              break
            }
            weightedAlpha += aAlpha * weight
            totalWeight += weight
          }

          if (totalWeight > 0 && weightedAlpha / totalWeight > 2) {
            // Normal zone found — always render, never suppressed by Long Shot
            const alpha = Math.round((weightedAlpha / totalWeight) * edgeFade)
            d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=alpha
          } else {
            // Long Shot: only for anchors where that anchor is in Long Shot mode
            // If an anchor has good results, no Long Shot renders within its radius
            let lsThreshold = null
            for (const a of anchorThresholds) {
              if (!a.longShot) continue  // this anchor has real results — skip Long Shot here
              const dist = Math.sqrt((lat-a.lat)**2 + ((lon-a.lon)*Math.cos(a.lat*Math.PI/180))**2)
              if (dist <= R && (lsThreshold === null || a.p05 < lsThreshold))
                lsThreshold = a.p05
            }
            if (lsThreshold === null || cf > lsThreshold + AA*100) continue
            const t = Math.max(0, Math.min(1, (lsThreshold + AA*100 - cf) / (2*AA*100)))
            const s = t * t * (3 - 2*t)
            const alpha = Math.round(40 * s * edgeFade)
            if (alpha === 0) continue
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * W + px] = 1
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


