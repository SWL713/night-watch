import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

const TEAL = [68, 255, 170]        // #44ffaa
const RADIUS_M = 10000             // 10km
const EXPIRE_MS = 5 * 3600000     // 5 hours
const FULL_OPACITY = 0.55

// Convert lat/lon to pixel point on the map
function latLonToPoint(map, lat, lon) {
  return map.latLngToContainerPoint([lat, lon])
}

// Metres to pixels at current zoom
function metresToPixels(map, lat, metres) {
  const p1 = map.latLngToContainerPoint([lat, 0])
  const p2 = map.latLngToContainerPoint([lat, 360 * metres / (2 * Math.PI * 6371000)])
  return Math.abs(p2.x - p1.x)
}

export default function SightingLayer({ sightings, onSightingClick }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1

    // Create canvas
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    function resize() {
      const size = map.getSize()
      canvas.width  = size.x * dpr
      canvas.height = size.y * dpr
      canvas.style.width  = size.x + 'px'
      canvas.style.height = size.y + 'px'
    }
    resize()
    map.on('resize moveend zoomend', resize)

    function draw() {
      const size = map.getSize()
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(dpr, dpr)

      const now = Date.now()

      for (const s of sightings) {
        const created = new Date(s.created_at).getTime()
        const age     = now - created
        if (age >= EXPIRE_MS) continue

        const frac    = age / EXPIRE_MS          // 0 = fresh, 1 = expired
        const opacity = FULL_OPACITY * (1 - frac)
        const pt      = latLonToPoint(map, s.lat, s.lon)
        const r       = metresToPixels(map, s.lat, RADIUS_M)

        const [ri, gi, bi] = TEAL
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r)
        grad.addColorStop(0,   `rgba(${ri},${gi},${bi},${opacity * 0.6})`)
        grad.addColorStop(0.5, `rgba(${ri},${gi},${bi},${opacity * 0.4})`)
        grad.addColorStop(1,   `rgba(${ri},${gi},${bi},0)`)

        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()

        // Subtle ring edge
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${ri},${gi},${bi},${opacity * 0.5})`
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Center dot
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ri},${gi},${bi},${Math.min(1, opacity * 2)})`
        ctx.fill()
      }

      // Reset scale for next frame
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    // Click handler — check if click is inside any sighting circle
    function handleClick(e) {
      if (!onSightingClick) return
      const pt = map.mouseEventToContainerPoint(e)
      const now = Date.now()

      for (const s of sightings) {
        const created = new Date(s.created_at).getTime()
        if (now - created >= EXPIRE_MS) continue
        const center = latLonToPoint(map, s.lat, s.lon)
        const r = metresToPixels(map, s.lat, RADIUS_M)
        const dist = Math.hypot(pt.x - center.x, pt.y - center.y)
        if (dist <= r) {
          onSightingClick(s, e.latlng)
          return
        }
      }
    }
    map.on('click', handleClick)

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('resize moveend zoomend', resize)
      map.off('click', handleClick)
      canvas.remove()
    }
  }, [map, sightings, onSightingClick])

  return null
}
