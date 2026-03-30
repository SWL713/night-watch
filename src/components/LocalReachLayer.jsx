import { useEffect, useRef, useMemo } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

// Renders Local Reach zones — top 20th percentile of viewport grid points
// Renders UNDER normal clear sky zones (z-index 200 vs ClearSkyLayer's 201)
export default function LocalReachLayer({ cloudData, getAvgCloudAt, frozenBounds, onTealPct }) {
  const map = useMap()
  const canvasRef = useRef(null)

  // Recalculate teal % in viewport whenever map moves
  useMapEvents({
    moveend: calcTealPct,
    zoomend: calcTealPct,
  })

  function calcTealPct() {
    if (!cloudData?.points || !getAvgCloudAt) { onTealPct?.(100); return }
    const bounds = map.getBounds()
    const keys = Object.keys(cloudData.points)
    let total = 0, teal = 0
    for (const k of keys) {
      const [lat, lon] = k.split(',').map(parseFloat)
      if (!bounds.contains([lat, lon])) continue
      total++
      const cf = getAvgCloudAt(lat, lon)
      if (cf !== null && cf <= 50) teal++  // qualifies as at least FAIR
    }
    onTealPct?.(total > 0 ? (teal / total) * 100 : 100)
  }

  // Compute local reach zones from frozen bounds
  const reachStats = useMemo(() => {
    if (!cloudData?.points || !frozenBounds) return null
    const { minLat, maxLat, minLon, maxLon } = frozenBounds
    const keys = Object.keys(cloudData.points)
    const inView = []
    for (const k of keys) {
      const [lat, lon] = k.split(',').map(parseFloat)
      if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) continue
      inView.push({ lat, lon, key: k })
    }
    if (!inView.length) return null

    // Average cloud cover per point
    const withAvg = inView.map(pt => {
      const fc = cloudData.points[pt.key]
      if (!fc?.length) return null
      const avg = fc.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / fc.length
      return { ...pt, avg }
    }).filter(Boolean)

    withAvg.sort((a, b) => a.avg - b.avg)
    const p20threshold = withAvg[Math.floor(withAvg.length * 0.20)]?.avg ?? 100

    return { p20threshold, bounds: frozenBounds }
  }, [cloudData, frozenBounds])

  useEffect(() => {
    // Initial teal pct calc
    setTimeout(calcTealPct, 500)
  }, [cloudData])

  useEffect(() => {
    if (!getAvgCloudAt || !reachStats) {
      if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null }
      return
    }

    const { p20threshold, bounds } = reachStats

    const canvas = document.createElement('canvas')
    // z-index 199 — below ClearSkyLayer (201) so normal zones render on top
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:199;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    const AA = 0.02
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
      const reachPixels = new Uint8Array(W * H)

      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const ll = map.containerPointToLatLng([px / dpr, py / dpr])
          const { lat, lng: lon } = ll
          if (lat < bounds.minLat || lat > bounds.maxLat ||
              lon < bounds.minLon || lon > bounds.maxLon) continue

          const cf = getAvgCloudAt(lat, lon)
          if (cf === null || cf > p20threshold + AA * 100) continue

          const edgeDist = Math.min(
            lat - bounds.minLat, bounds.maxLat - lat,
            lon - bounds.minLon, bounds.maxLon - lon
          )
          const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)

          const t = Math.max(0, Math.min(1, (p20threshold + AA*100 - cf) / (2*AA*100)))
          const s = t * t * (3 - 2 * t)
          const alpha = Math.round(40 * s * edgeFade)
          if (alpha === 0) continue

          const idx = (py * W + px) * 4
          d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
          reachPixels[py * W + px] = 1
        }
      }

      ctx.putImageData(imageData, 0, 0)

      // Dashed orange border
      ctx.strokeStyle = 'rgba(255,140,0,0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      for (let py = 1; py < H - 1; py++) {
        for (let px = 1; px < W - 1; px++) {
          if (!reachPixels[py * W + px]) continue
          if (!reachPixels[(py-1)*W+px] || !reachPixels[(py+1)*W+px] ||
              !reachPixels[py*W+px-1]   || !reachPixels[py*W+px+1]) {
            ctx.rect(px, py, 1, 1)
          }
        }
      }
      ctx.stroke()
    }

    redraw()
    map.on('moveend zoomend resize', redraw)

    return () => {
      map.off('moveend zoomend resize', redraw)
      if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null }
    }
  }, [map, getAvgCloudAt, reachStats])

  return null
}
