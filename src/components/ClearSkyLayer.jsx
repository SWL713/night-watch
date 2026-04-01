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

  // ── 1. Scoring canvas ────────────────────────────────────────────────────
  const geoImage = useMemo(() => {
    if (!cloudData?.points || !anchor) return null
    const keys = Object.keys(cloudData.points)
    if (!keys.length) return null

    const lats    = keys.map(k => parseFloat(k.split(',')[0]))
    const lons    = keys.map(k => parseFloat(k.split(',')[1]))
    const minLat  = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon  = Math.min(...lons), maxLon = Math.max(...lons)
    const spacing = cloudData.spacing || 0.1
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
    const latSpan = maxLat - minLat
    const lonSpan = maxLon - minLon

    // Mercator-correct lat mapping — ImageOverlay positions using Mercator projection
    // so canvas pixels must map to lat/lon the same way Mercator does, otherwise
    // teal zones drift from their actual geographic position at higher zoom levels
    const MERC_R = 6378137.0
    const maxY = MERC_R * Math.log(Math.tan(Math.PI / 4 + maxLat * Math.PI / 360))
    const minY = MERC_R * Math.log(Math.tan(Math.PI / 4 + minLat * Math.PI / 360))
    const ySpan = maxY - minY

    for (let py = 0; py < CANVAS_H; py++) {
      // Mercator-correct lat for this pixel row
      const projY = maxY - (py / (CANVAS_H - 1)) * ySpan
      const lat = (360 / Math.PI) * Math.atan(Math.exp(projY / MERC_R)) - 90
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
          if (alpha > 0) { d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha }
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

  // ── 3. Circle — created BEFORE mask so mask can read _point/_radius ──────
  useEffect(() => {
    if (circleRef.current) { mapInstance.removeLayer(circleRef.current); circleRef.current = null }
    if (!anchor) return
    const isLongShot = geoImage?.longShot ?? false
    circleRef.current = L.circle([anchor.lat, anchor.lng], {
      radius: radiusMiles * 1609.34,
      color:    isLongShot ? 'rgba(255,140,0,0.85)' : '#44ddaa',
      weight:   isLongShot ? 1.5 : 2,
      dashArray: isLongShot ? '6 8' : null,
      fill: false, opacity: 0.9, interactive: false,
    }).addTo(mapInstance)
    const el = circleRef.current.getElement?.()
    if (el) el.style.zIndex = 500
    return () => { if (circleRef.current) { mapInstance.removeLayer(circleRef.current); circleRef.current = null } }
  }, [anchor, radiusMiles, geoImage?.longShot, mapInstance])

  // ── 4. Mask — reads _point/_radius/_radiusY from live circle, no guessing ─
  useEffect(() => {
    if (!anchor) return
    const container = mapInstance.getContainer()

    if (!maskRef.current) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:400;'
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('fill', 'rgba(6,8,15,0.78)')
      path.setAttribute('fill-rule', 'evenodd')
      svg.appendChild(path)
      container.appendChild(svg)
      maskRef.current = { svg, path }
    }

    function updateMask() {
      if (!circleRef.current?._point) return
      const size = mapInstance.getSize()
      const { svg, path } = maskRef.current
      svg.setAttribute('width', size.x)
      svg.setAttribute('height', size.y)
      svg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`)

      // Read exact values Leaflet SVG renderer uses (leaflet-src.js _updateCircle line 13176)
      const lp = circleRef.current._point
      const r  = Math.max(Math.round(circleRef.current._radius), 1)
      const r2 = Math.max(Math.round(circleRef.current._radiusY), 1) || r

      // layerPoint → containerPoint (leaflet-src.js layerPointToContainerPoint line 4158)
      const cp = mapInstance.layerPointToContainerPoint(lp)
      const cx = cp.x, cy = cp.y

      // Outer rect + polygon circle hole (evenodd rule punches the hole)
      const rect = `M 0 0 h ${size.x} v ${size.y} h ${-size.x} Z`
      const N = 128
      const pts = []
      for (let i = 0; i < N; i++) {
        const a = (2 * Math.PI * i) / N
        pts.push(`${cx + r * Math.cos(a)},${cy + r2 * Math.sin(a)}`)
      }
      path.setAttribute('d', `${rect} M ${pts.join(' L ')} Z`)
      onCircleBottom?.({ x: cx, y: cy + r2 + 10 })
    }

    function scheduleUpdate() { requestAnimationFrame(updateMask) }

    scheduleUpdate()
    mapInstance.on('move zoom moveend zoomend resize', scheduleUpdate)
    return () => {
      mapInstance.off('move zoom moveend zoomend resize', scheduleUpdate)
      if (maskRef.current) { maskRef.current.svg.remove(); maskRef.current = null }
      onCircleBottom?.(null)
    }
  }, [anchor, radiusMiles, geoImage?.longShot, mapInstance])  // eslint-disable-line

  return null
}
