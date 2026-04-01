// ClearSkyLayer — radius-based clear sky scoring centered on an anchor point.
//
// ARCHITECTURE: Only imports react, react-leaflet, leaflet. No cross-component imports.
// Module graph unchanged — safe from Rollup circular dep crashes.
//
// HOW IT WORKS:
// 1. useMemo renders the full data-bounds scoring canvas once per cloudData/windowHours
//    (same as before — fast ImageOverlay, no per-pan pixel work)
// 2. A second lightweight mask canvas darkens everything outside the radius circle
// 3. Scoring renormalizes to only points inside the radius (debounced on slider release)
// 4. A Leaflet Circle draws the solid teal boundary line
//
// Props:
//   cloudData      — HRRR cloud data object
//   getAvgCloudAt  — bilinear interpolation fn from useCloudCover
//   windowHours    — 4 or 8
//   anchor         — { lat, lng } center of scoring radius (GPS or manual)
//   radiusMiles    — radius in miles
//   onLongShot     — callback(bool)
//   onBestInCircle — callback(pctClear) — best absolute score inside radius

import { useEffect, useRef, useMemo, useState } from 'react'
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

// Miles to degrees latitude (approximate, good enough for scoring)
function milesToDeg(miles) { return miles / 69 }

export default function ClearSkyLayer({
  cloudData, getAvgCloudAt, windowHours = 8,
  anchor, radiusMiles = 40,
  onLongShot, onBestInCircle,
}) {
  const map         = useRef(null)
  const mapInstance = useMap()
  map.current       = mapInstance

  const overlayRef  = useRef(null)
  const maskRef     = useRef(null)
  const circleRef   = useRef(null)
  const debounceRef = useRef(null)

  // Track last rendered radius/anchor for mask redraws
  const lastRenderRef = useRef({ anchor: null, radiusMiles: null })

  // ── 1. Full-bounds scoring canvas ────────────────────────────────────────────
  // Renders once per cloudData/windowHours — same fast ImageOverlay as before
  // Now scores ONLY points inside the radius, percentile-ranked within that set
  const geoImage = useMemo(() => {
    if (!cloudData?.points || !anchor) return null
    const keys = Object.keys(cloudData.points)
    if (!keys.length) return null

    const lats    = keys.map(k => parseFloat(k.split(',')[0]))
    const lons     = keys.map(k => parseFloat(k.split(',')[1]))
    const minLat   = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon   = Math.min(...lons), maxLon = Math.max(...lons)
    const spacing  = cloudData.spacing || 0.1
    const radiusDeg = milesToDeg(radiusMiles)

    // Windowed stats for all points
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

    // Filter to only points inside the radius
    const insideKeys = keys.filter(k => {
      const [la, lo] = k.split(',').map(parseFloat)
      const d = Math.sqrt(
        (la - anchor.lat) ** 2 +
        ((lo - anchor.lng) * Math.cos(anchor.lat * Math.PI / 180)) ** 2
      )
      return d <= radiusDeg
    })

    if (!insideKeys.length) return null

    // Percentile thresholds from points INSIDE radius only
    const meds = insideKeys
      .map(k => pointStats[k]?.med)
      .filter(v => v != null)
      .sort((a, b) => a - b)

    const p20 = meds[Math.floor(meds.length * 0.20)] ?? 100
    const p40 = meds[Math.floor(meds.length * 0.40)] ?? 100
    const p60 = Math.min(meds[Math.floor(meds.length * 0.60)] ?? 100, 45)
    const p05 = meds[Math.floor(meds.length * 0.05)] ?? 100

    const qualCount = meds.filter(m => m <= 45).length
    const globalLongShot = qualCount / meds.length < 0.05

    // Best absolute score inside radius
    const bestCloud = meds[0] ?? 100
    const bestClear = Math.round(Math.max(0, 100 - bestCloud))
    onBestInCircle?.(bestClear)
    onLongShot?.(globalLongShot)

    // Bilinear interpolation on windowed avg
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
      const corners = [
        [v00, (1 - tx) * (1 - ty)],
        [v01, tx       * (1 - ty)],
        [v10, (1 - tx) * ty      ],
        [v11, tx       * ty      ],
      ]
      let sum = 0, wt = 0
      for (const [v, w] of corners) {
        if (v === null) continue
        sum += v * w; wt += w
      }
      return wt > 0 ? sum / wt : null
    }

    // Render geographic canvas — only color pixels inside radius
    const canvas = document.createElement('canvas')
    canvas.width  = CANVAS_W
    canvas.height = CANVAS_H
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

        // Only render inside radius
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
          // Normal zone — single set of thresholds for the whole radius
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
          // Long Shot
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

    // Dashed orange border for Long Shot
    if (globalLongShot && lsPixels) {
      ctx.strokeStyle = 'rgba(255,140,0,0.7)'
      ctx.lineWidth = 0.75
      ctx.setLineDash([3, 6])
      ctx.beginPath()
      for (let py = 1; py < CANVAS_H - 1; py++) {
        for (let px = 1; px < CANVAS_W - 1; px++) {
          if (!lsPixels[py * CANVAS_W + px]) continue
          if (!lsPixels[(py-1)*CANVAS_W+px] || !lsPixels[(py+1)*CANVAS_W+px] ||
              !lsPixels[py*CANVAS_W+px-1]   || !lsPixels[py*CANVAS_W+px+1]) {
            ctx.rect(px, py, 1, 1)
          }
        }
      }
      ctx.stroke()
    }

    return {
      dataUrl: canvas.toDataURL('image/png'),
      bounds: { minLat, maxLat, minLon, maxLon },
      longShot: globalLongShot,
    }
  }, [cloudData, windowHours, anchor, radiusMiles])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Mount / update ImageOverlay ────────────────────────────────────────
  useEffect(() => {
    if (overlayRef.current) {
      mapInstance.removeLayer(overlayRef.current)
      overlayRef.current = null
    }
    if (!geoImage?.dataUrl) return

    const { dataUrl, bounds: { minLat, maxLat, minLon, maxLon } } = geoImage
    overlayRef.current = L.imageOverlay(
      dataUrl,
      [[minLat, minLon], [maxLat, maxLon]],
      { opacity: 1, zIndex: 201, interactive: false }
    ).addTo(mapInstance)

    return () => {
      if (overlayRef.current) {
        mapInstance.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [geoImage, mapInstance])

  // ── 3. Dark mask outside radius ───────────────────────────────────────────
  // Lightweight canvas layer — redraws on moveend/zoomend and when anchor/radius changes
  useEffect(() => {
    if (!anchor || !geoImage) return

    function drawMask() {
      const size = mapInstance.getSize()
      const dpr  = Math.min(window.devicePixelRatio || 1, 1.5)
      const W = Math.round(size.x * dpr), H = Math.round(size.y * dpr)

      if (!maskRef.current) {
        const c = document.createElement('canvas')
        c.style.cssText = 'position:absolute;pointer-events:none;z-index:202;'
        mapInstance.getPanes().overlayPane.appendChild(c)
        maskRef.current = c
      }

      const canvas = maskRef.current
      canvas.width  = W; canvas.height = H
      canvas.style.width  = size.x + 'px'
      canvas.style.height = size.y + 'px'
      L.DomUtil.setPosition(canvas, mapInstance.containerPointToLayerPoint([0, 0]))

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)

      // Dark fill everywhere
      ctx.fillStyle = 'rgba(6,8,15,0.72)'
      ctx.fillRect(0, 0, W, H)

      // Cut out the circle using destination-out
      const center = mapInstance.latLngToContainerPoint([anchor.lat, anchor.lng])
      const edgePoint = mapInstance.latLngToContainerPoint([
        anchor.lat + milesToDeg(radiusMiles), anchor.lng
      ])
      const radiusPx = Math.abs(edgePoint.y - center.y) * dpr
      const cx = center.x * dpr, cy = center.y * dpr

      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }

    drawMask()
    mapInstance.on('moveend zoomend resize move', drawMask)

    return () => {
      mapInstance.off('moveend zoomend resize move', drawMask)
      if (maskRef.current) {
        maskRef.current.remove()
        maskRef.current = null
      }
    }
  }, [anchor, radiusMiles, geoImage, mapInstance])

  // ── 4. Teal circle boundary line ─────────────────────────────────────────
  useEffect(() => {
    if (circleRef.current) {
      mapInstance.removeLayer(circleRef.current)
      circleRef.current = null
    }
    if (!anchor) return

    circleRef.current = L.circle([anchor.lat, anchor.lng], {
      radius: radiusMiles * 1609.34, // miles to meters
      color: '#44ddaa',
      weight: 2,
      fill: false,
      opacity: 0.9,
      interactive: false,
    }).addTo(mapInstance)

    return () => {
      if (circleRef.current) {
        mapInstance.removeLayer(circleRef.current)
        circleRef.current = null
      }
    }
  }, [anchor, radiusMiles, mapInstance])

  return null
}
