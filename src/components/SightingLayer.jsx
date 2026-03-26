import { useEffect, useRef, useCallback } from 'react'
import { useMap } from 'react-leaflet'

const TEAL       = [68, 255, 170]
const RADIUS_M   = 30000            // 30km (3x original)
const EXPIRE_MS  = 5 * 3600000
const FULL_ALPHA = 0.55

export default function SightingLayer({ sightings, onSightingClick }) {
  const map          = useMap()
  const canvasRef    = useRef(null)
  const animRef      = useRef(null)
  const sightingsRef = useRef(sightings)

  useEffect(() => { sightingsRef.current = sightings }, [sightings])

  // metres → pixels at a given latitude
  function mToPx(lat, metres) {
    const p1 = map.project([lat, 0],     map.getZoom())
    const p2 = map.project([lat, 0.001], map.getZoom())
    const pxPerDeg = Math.abs(p2.x - p1.x) / 0.001
    const degPerM  = 360 / (2 * Math.PI * 6371000)
    return pxPerDeg * degPerM * metres
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // The overlay pane is CSS-translated by Leaflet during panning.
    // We need canvas coords in overlay-pane-local space, not container space.
    // Use map.project/unproject at pixel level relative to map origin.
    const mapSize   = map.getSize()
    const mapOrigin = map.getPixelOrigin()   // top-left of map in world pixels

    canvas.width  = mapSize.x * dpr
    canvas.height = mapSize.y * dpr
    canvas.style.width  = mapSize.x + 'px'
    canvas.style.height = mapSize.y + 'px'
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, mapSize.x, mapSize.y)

    const now = Date.now()

    for (const s of sightingsRef.current) {
      const created = new Date(s.created_at).getTime()
      const age     = now - created
      if (age >= EXPIRE_MS) continue

      const frac   = age / EXPIRE_MS
      const alpha  = FULL_ALPHA * (1 - frac)

      // Convert lat/lon to overlay-pane-local pixel coords
      const worldPt = map.project([s.lat, s.lon], map.getZoom())
      const x = worldPt.x - mapOrigin.x
      const y = worldPt.y - mapOrigin.y
      const r = mToPx(s.lat, RADIUS_M)

      const [ri, gi, bi] = TEAL
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0,   `rgba(${ri},${gi},${bi},${alpha * 0.6})`)
      grad.addColorStop(0.5, `rgba(${ri},${gi},${bi},${alpha * 0.35})`)
      grad.addColorStop(1,   `rgba(${ri},${gi},${bi},0)`)

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${ri},${gi},${bi},${alpha * 0.45})`
      ctx.lineWidth   = 1.5
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${ri},${gi},${bi},${Math.min(1, alpha * 2)})`
      ctx.fill()
    }

    animRef.current = requestAnimationFrame(draw)
  }, [map])

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1

    // Canvas lives in the overlay pane — Leaflet transforms this pane during
    // panning, so our world-pixel math stays correct automatically
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    // Reposition canvas origin when map moves
    function reposition() {
      const topLeft = map.containerPointToLayerPoint([0, 0])
      canvas.style.transform = `translate(${topLeft.x}px,${topLeft.y}px)`
    }
    map.on('movestart move moveend zoomstart zoom zoomend', reposition)
    reposition()

    animRef.current = requestAnimationFrame(draw)

    // Click handler — check inside any sighting circle
    function handleClick(e) {
      if (!onSightingClick) return
      const now       = Date.now()
      const mapOrigin = map.getPixelOrigin()
      const clickPt   = map.project(e.latlng, map.getZoom())
      const cx = clickPt.x - mapOrigin.x
      const cy = clickPt.y - mapOrigin.y

      for (const s of sightingsRef.current) {
        const created = new Date(s.created_at).getTime()
        if (now - created >= EXPIRE_MS) continue
        const worldPt = map.project([s.lat, s.lon], map.getZoom())
        const sx = worldPt.x - mapOrigin.x
        const sy = worldPt.y - mapOrigin.y
        const r  = mToPx(s.lat, RADIUS_M)
        if (Math.hypot(cx - sx, cy - sy) <= r) {
          onSightingClick(s, e.latlng)
          return
        }
      }
    }
    map.on('click', handleClick)

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('movestart move moveend zoomstart zoom zoomend', reposition)
      map.off('click', handleClick)
      canvas.remove()
    }
  }, [map, draw, onSightingClick])

  return null
}
