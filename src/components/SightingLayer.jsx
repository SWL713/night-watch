import { useEffect, useRef, useCallback } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const TEAL       = [68, 255, 170]
const RADIUS_M   = 30000
const EXPIRE_MS  = 5 * 3600000
const FULL_ALPHA = 0.55

export default function SightingLayer({ sightings, onSightingClick }) {
  const map          = useMap()
  const canvasRef    = useRef(null)
  const animRef      = useRef(null)
  const sightingsRef = useRef(sightings)

  useEffect(() => { sightingsRef.current = sightings }, [sightings])

  const reposition = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const topLeft = map.containerPointToLayerPoint([0, 0])
    L.DomUtil.setPosition(canvas, topLeft)
  }, [map])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Resize to match map
    const size = map.getSize()
    const dpr  = window.devicePixelRatio || 1
    if (canvas.width !== size.x * dpr) {
      canvas.width  = size.x * dpr
      canvas.height = size.y * dpr
      canvas.style.width  = size.x + 'px'
      canvas.style.height = size.y + 'px'
    }

    reposition()

    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.x, size.y)

    const now = Date.now()

    for (const s of sightingsRef.current) {
      const created = new Date(s.created_at).getTime()
      const age     = now - created
      if (age >= EXPIRE_MS) continue

      const frac  = age / EXPIRE_MS
      const alpha = FULL_ALPHA * (1 - frac)

      // Use containerPointToLayerPoint offset — draw in layer (canvas) coords
      const containerPt = map.latLngToContainerPoint([s.lat, s.lon])
      const layerPt     = map.containerPointToLayerPoint(containerPt)
      // Since canvas is positioned at containerPointToLayerPoint([0,0]),
      // we just use containerPt directly as our draw coords
      const x = containerPt.x
      const y = containerPt.y

      // Radius in pixels
      const earthCircumference = 2 * Math.PI * 6371000
      const metersPerDeg = earthCircumference / 360
      const p1 = map.latLngToContainerPoint([s.lat, 0])
      const p2 = map.latLngToContainerPoint([s.lat, RADIUS_M / metersPerDeg])
      const r  = Math.abs(p2.x - p1.x)

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

      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${ri},${gi},${bi},${Math.min(1, alpha * 2)})`
      ctx.fill()
    }

    ctx.restore()
    animRef.current = requestAnimationFrame(draw)
  }, [map, reposition])

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:450;'
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    map.on('move zoom resize moveend zoomend', reposition)
    animRef.current = requestAnimationFrame(draw)

    // Click detection
    function handleClick(e) {
      if (!onSightingClick) return
      const now = Date.now()
      for (const s of sightingsRef.current) {
        const created = new Date(s.created_at).getTime()
        if (now - created >= EXPIRE_MS) continue
        const cp  = map.latLngToContainerPoint([s.lat, s.lon])
        const earthCircumference = 2 * Math.PI * 6371000
        const metersPerDeg = earthCircumference / 360
        const p1  = map.latLngToContainerPoint([s.lat, 0])
        const p2  = map.latLngToContainerPoint([s.lat, RADIUS_M / metersPerDeg])
        const r   = Math.abs(p2.x - p1.x)
        const clickPt = map.latLngToContainerPoint(e.latlng)
        if (Math.hypot(clickPt.x - cp.x, clickPt.y - cp.y) <= r) {
          onSightingClick(s, { x: clickPt.x, y: clickPt.y })
          return
        }
      }
    }
    map.on('click', handleClick)

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('move zoom resize moveend zoomend', reposition)
      map.off('click', handleClick)
      canvas.remove()
    }
  }, [map, draw, reposition, onSightingClick])

  return null
}
