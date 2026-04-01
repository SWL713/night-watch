// ClearSkyLayer — radius-based clear sky scoring centered on an anchor point.
//
// ARCHITECTURE: Only imports react, react-leaflet, leaflet. No cross-component imports.
//
// Props:
//   cloudData        — HRRR cloud data
//   getAvgCloudAt    — bilinear interpolation fn
//   windowHours      — 4 or 8
//   anchor           — { lat, lng } scoring center
//   radiusMiles      — live radius (updates circle/mask in real time)
//   renderedRadius   — debounced radius (triggers canvas re-render)
//   onLongShot       — callback(bool)
//   onBestInCircle   — callback(pctClear)
//   onCircleBottom   — callback({x, y}) screen position of circle bottom-center

import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const CANVAS_W = 900
const CANVAS_H = 600
const AA       = 0.015
const FADE     = 0.3

function pyFmt(v) {
  const s = v.toString()
  return s.includes('.') ? s : s + '.0'
}

function milesToDeg(miles) { return miles / 69 }

export default function ClearSkyLayer({
  cloudData, getAvgCloudAt, windowHours = 8,
  anchor, radiusMiles = 40, renderedRadius = 40,
  onLongShot, onBestInCircle, onCircleBottom,
}) {
  const mapInstance = useMap()
  const overlayRef  = useRef(null)
  const maskRef     = useRef(null)
  const circleRef   = useRef(null)

  // ── 1. Scoring canvas — re-renders only on renderedRadius / anchor / cloudData change ──
  const geoImage = useMemo(() => {
    if (!cloudData?.points || !anchor) return null
    const keys = Object.keys(cloudData.points)
    if (!keys.length) return null

    const lats    = keys.map(k => parseFloat(k.split(',')[0]))
    const lons     = keys.map(k => parseFloat(k.split(',')[1]))
    const minLat   = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon   = Math.min(...lons), maxLon = Math.max(...lons)
    const spacing  = cloudData.spacing || 0.1
    const radiusDeg = milesToDeg(renderedRadius)

    const now    = Date.now()
    const cutoff = now + windowHours * 3600000
    const pointStats = {}
    for (const k of keys) {
      const fc = cloudData.points[k]
      if (!fc?.length) continue
      const windowed = fc.filter(p => {
        const t = p.timeMs ?? new Date(p.time).getTime()
        return t >= now && t <= cutoff
      })
      const use = windowed.length > 0 ? windowed : fc
      const sorted = use.map(p => p.cloudcover ?? 0).sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      const avg = use.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / use.length
      pointStats[k] = { med, avg }
    }

    const insideKeys = keys.filter(k => {
      const [la, lo] = k.split(',').map(parseFloat)
      const d = Math.sqrt(
        (la - anchor.lat) ** 2 +
        ((lo - anchor.lng) * Math.cos(anchor.lat * Math.PI / 180)) ** 2
      )
      return d <= radiusDeg
    })
    if (!insideKeys.length) return null

    const meds = insideKeys.map(k => pointStats[k]?.med).filter(v => v != null).sort((a, b) => a - b)
    const p20 = meds[Math.floor(meds.length * 0.20)] ?? 100
    const p40 = meds[Math.floor(meds.length * 0.40)] ?? 100
    const p60 = Math.min(meds[Math.floor(meds.length * 0.60)] ?? 100, 55)
    const p05 = meds[Math.floor(meds.length * 0.05)] ?? 100
    const qualCount = meds.filter(m => m <= 45).length
    // Long Shot only when even the best available spot is heavily clouded (>55% cloud = <45% clear)
    const globalLongShot = meds[0] > 55
    const bestClear = Math.round(Math.max(0, 100 - (meds[0] ?? 100)))

    onBestInCircle?.(bestClear)
    onLongShot?.(globalLongShot)

    function getWindowedAvg(lat, lon) {
      const lat0 = parseFloat((Math.floor(lat / spacing) * spacing).toFixed(2))
      const lon0 = parseFloat((Math.floor(lon / spacing) * spacing).toFixed(2))
      const lat1 = parseFloat((lat0 + spacing).toFixed(2))
      const lon1 = parseFloat((lon0 + spacing).toFixed(2))
      const tx = (lon - lon0) / spacing
      const ty = (lat - lat0) / spacing
      const fmt = v => pyFmt(parseFloat(v.toFixed(1)))
      const v00 = pointStats[`${fmt(lat0)},${fmt(lon0)}`]?.avg ?? null
      const v10 = pointStats[`${fmt(lat1)},${fmt(lon0)}`]?.avg ?? null
      const v01 = pointStats[`${fmt(lat0)},${fmt(lon1)}`]?.avg ?? null
      const v11 = pointStats[`${fmt(lat1)},${fmt(lon1)}`]?.avg ?? null
      const valid = [v00, v10, v01, v11].filter(v => v !== null)
      if (!valid.length) return null
      if (valid.length < 2) return valid[0]
      const corners = [[v00,(1-tx)*(1-ty)],[v01,tx*(1-ty)],[v10,(1-tx)*ty],[v11,tx*ty]]
      let sum = 0, wt = 0
      for (const [v, w] of corners) { if (v !== null) { sum += v*w; wt += w } }
      return wt > 0 ? sum / wt : null
    }

    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W; canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    const imageData = ctx.createImageData(CANVAS_W, CANVAS_H)
    const d = imageData.data
    const lsPixels = globalLongShot ? new Uint8Array(CANVAS_W * CANVAS_H) : null
    const latSpan = maxLat - minLat
    const lonSpan = maxLon - minLon

    for (let py = 0; py < CANVAS_H; py++) {
      const lat = maxLat - (py / (CANVAS_H - 1)) * latSpan
      for (let px = 0; px < CANVAS_W; px++) {
        const lon = minLon + (px / (CANVAS_W - 1)) * lonSpan
        const distFromAnchor = Math.sqrt(
          (lat - anchor.lat) ** 2 +
          ((lon - anchor.lng) * Math.cos(anchor.lat * Math.PI / 180)) ** 2
        )
        if (distFromAnchor > radiusDeg) continue
        const cf = getWindowedAvg(lat, lon)
        if (cf === null) continue
        const edgeFade = Math.pow(Math.max(0, Math.min(1,
          Math.min(lat - minLat, maxLat - lat, lon - minLon, maxLon - lon) / FADE
        )), 0.4)
        const idx = (py * CANVAS_W + px) * 4

        if (cf <= p60) {
          const cfBINS = [
            { maxCf: p20, alpha: 153, nextAlpha: 95 },
            { maxCf: p40, alpha: 95,  nextAlpha: 45 },
            { maxCf: p60, alpha: 45,  nextAlpha: 0  },
          ]
          let aAlpha = 0
          for (const bin of cfBINS) {
            const lo = bin.maxCf - AA * 100
            const hi = bin.maxCf + AA * 100
            if (cf > hi) continue
            if (cf <= lo) { aAlpha = bin.alpha; break }
            const t = (hi - cf) / (2 * AA * 100)
            const s = t * t * (3 - 2 * t)
            aAlpha = Math.round(bin.nextAlpha + (bin.alpha - bin.nextAlpha) * s)
            break
          }
          if (aAlpha > 2) {
            d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=Math.round(aAlpha * edgeFade)
          }
        } else if (globalLongShot && cf <= p05 + AA * 100) {
          const t = Math.max(0, Math.min(1, (p05 + AA * 100 - cf) / (2 * AA * 100)))
          const s = t * t * (3 - 2 * t)
          const alpha = Math.round(40 * s * edgeFade)
          if (alpha > 0) {
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * CANVAS_W + px] = 1
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)

    return { dataUrl: canvas.toDataURL('image/png'), bounds: { minLat, maxLat, minLon, maxLon }, longShot: globalLongShot }
  }, [cloudData, windowHours, anchor, renderedRadius])  // eslint-disable-line

  // ── 2. ImageOverlay ──────────────────────────────────────────────────────
  useEffect(() => {
    if (overlayRef.current) { mapInstance.removeLayer(overlayRef.current); overlayRef.current = null }
    if (!geoImage?.dataUrl) return
    const { dataUrl, bounds: { minLat, maxLat, minLon, maxLon } } = geoImage
    overlayRef.current = L.imageOverlay(dataUrl, [[minLat, minLon], [maxLat, maxLon]],
      { opacity: 1, zIndex: 201, interactive: false }).addTo(mapInstance)
    return () => { if (overlayRef.current) { mapInstance.removeLayer(overlayRef.current); overlayRef.current = null } }
  }, [geoImage, mapInstance])

  // ── 3. Mask — SVG evenodd path: world rect with circle hole ─────────────
  // This is the only reliable hard-boundary approach. Leaflet's SVG pane
  // handles all projection math. No canvas compositing, no coordinate drift.
  useEffect(() => {
    if (!anchor) return

    const svgPane = mapInstance.getPanes().overlayPane

    // Create SVG element once
    if (!maskRef.current) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:203;overflow:visible;'
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('fill', 'rgba(6,8,15,0.78)')
      path.setAttribute('fill-rule', 'evenodd')
      svg.appendChild(path)
      svgPane.appendChild(svg)
      maskRef.current = { svg, path }
    }

    function updateMask() {
      const { path } = maskRef.current

      // Convert anchor center and radius edge to layer points
      const c  = mapInstance.latLngToLayerPoint([anchor.lat, anchor.lng])
      const e  = mapInstance.latLngToLayerPoint([anchor.lat + milesToDeg(radiusMiles), anchor.lng])
      const r  = Math.abs(e.y - c.y)

      // Large world-covering rect (in layer coords)
      const size = mapInstance.getSize()
      const tl   = mapInstance.containerPointToLayerPoint([0, 0])
      const pad  = 2000
      const x    = tl.x - pad, y = tl.y - pad
      const w    = size.x + pad * 2, h = size.y + pad * 2

      // evenodd: rect covers world, circle subtracts → leaves circle clear
      // SVG arc: two arcs to make a full circle path
      const d = [
        `M ${x} ${y} h ${w} v ${h} h ${-w} Z`,
        `M ${c.x + r} ${c.y}`,
        `A ${r} ${r} 0 1 0 ${c.x - r} ${c.y}`,
        `A ${r} ${r} 0 1 0 ${c.x + r} ${c.y} Z`,
      ].join(' ')
      path.setAttribute('d', d)

      // Report circle bottom-center in container coords for label
      const cc = mapInstance.latLngToContainerPoint([anchor.lat, anchor.lng])
      const ec = mapInstance.latLngToContainerPoint([anchor.lat + milesToDeg(radiusMiles), anchor.lng])
      onCircleBottom?.({ x: cc.x, y: cc.y + Math.abs(ec.y - cc.y) + 10 })
    }

    updateMask()
    mapInstance.on('moveend zoomend resize move zoom', updateMask)
    return () => {
      mapInstance.off('moveend zoomend resize move zoom', updateMask)
      if (maskRef.current) {
        maskRef.current.svg.remove()
        maskRef.current = null
      }
      onCircleBottom?.(null)
    }
  }, [anchor, radiusMiles, mapInstance])  // eslint-disable-line

  // ── 4. Circle boundary — teal solid normally, dashed orange on Long Shot ──
  useEffect(() => {
    if (circleRef.current) { mapInstance.removeLayer(circleRef.current); circleRef.current = null }
    if (!anchor) return
    const isLongShot = geoImage?.longShot ?? false
    circleRef.current = L.circle([anchor.lat, anchor.lng], {
      radius: radiusMiles * 1609.34,
      color:    isLongShot ? 'rgba(255,140,0,0.85)' : '#44ddaa',
      weight:   isLongShot ? 1.5 : 2,
      dashArray: isLongShot ? '6 8' : null,
      fill: false,
      opacity: 0.9,
      interactive: false,
    }).addTo(mapInstance)
    return () => { if (circleRef.current) { mapInstance.removeLayer(circleRef.current); circleRef.current = null } }
  }, [anchor, radiusMiles, geoImage?.longShot, mapInstance])

  return null
}
