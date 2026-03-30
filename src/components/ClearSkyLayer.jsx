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
    const allAvgs = keys.map(k => {
      const fc = cloudData.points[k]
      if (!fc?.length) return null
      // Filter to forward window only
      const windowed = fc.filter(p => {
        const t = new Date(p.time).getTime()
        return t >= now && t <= cutoff
      })
      const use = windowed.length > 0 ? windowed : fc
      return use.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / use.length
    }).filter(v => v !== null).sort((a, b) => a - b)

    const p20 = allAvgs[Math.floor(allAvgs.length * 0.20)]
    const p40 = allAvgs[Math.floor(allAvgs.length * 0.40)]
    const p60 = allAvgs[Math.floor(allAvgs.length * 0.60)]
    const longShot = p20 > 50
    onLongShot?.(longShot)

    return {
      bounds,
      thresholds: longShot
        ? { best: null, good: null, fair: p20, longShot: true }
        : { best: p20, good: p40, fair: Math.min(p60, 50), longShot: false },
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
            if (cf > thresholds.fair) continue
            const t = Math.max(0, Math.min(1, (thresholds.fair + AA*100 - cf) / (2*AA*100)))
            const s = t * t * (3 - 2 * t)
            const alpha = Math.round(45 * s * edgeFade)
            if (alpha === 0) continue
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * W + px] = 1
          } else {
            if (cf > 50) continue
            const BINS = [
              { maxCloud: thresholds.fair, alpha: 45  },
              { maxCloud: thresholds.good, alpha: 95  },
              { maxCloud: thresholds.best, alpha: 153 },
            ]
            let alpha = 0
            for (const bin of BINS) {
              const lo = bin.maxCloud - AA * 100
              const hi = bin.maxCloud + AA * 100
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


