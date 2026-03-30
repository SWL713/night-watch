// ClearSkyLayer — geographic pre-render of clear sky scoring → Leaflet ImageOverlay
//
// ARCHITECTURE: Only imports react, react-leaflet, leaflet — identical to before.
// No new module boundaries crossed. Module graph is unchanged from original.
//
// HOW IT WORKS:
// useMemo computes a fixed geographic canvas (600×400px covering data bounds)
// once per cloudData/windowHours change. Leaflet mounts it as an ImageOverlay
// and handles all pan/zoom repositioning automatically — zero pixel work on moves.
//
// Previously: per-pixel loop ran on every moveend/zoomend (~3M iterations on
// a 3× DPR phone). Now: canvas renders once, Leaflet does the rest.

import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const CANVAS_W = 600
const CANVAS_H = 400

const ANCHORS = [
  { lat: 42.9, lon: -78.9 },  // Buffalo
  { lat: 43.0, lon: -76.1 },  // Syracuse
  { lat: 43.0, lon: -73.8 },  // Albany
  { lat: 44.5, lon: -73.2 },  // Burlington
  { lat: 42.4, lon: -71.1 },  // Boston
  { lat: 40.7, lon: -74.0 },  // NYC
  { lat: 39.9, lon: -75.2 },  // Philadelphia
]
const ANCHOR_R = 150 / 69
const BLEND    = 30  / 69
const AA       = 0.015
const FADE     = 0.5

function pyFmt(v) {
  const s = v.toString()
  return s.includes('.') ? s : s + '.0'
}

export default function ClearSkyLayer({ cloudData, getAvgCloudAt, windowHours = 8, onLongShot }) {
  const map        = useMap()
  const overlayRef = useRef(null)

  // ── Geographic pre-render ────────────────────────────────────────────────────
  // Runs once per cloudData/windowHours change, not on every map move.
  // Output is a plain { dataUrl, bounds, longShot } object.
  const geoImage = useMemo(() => {
    if (!cloudData?.points) return null
    const keys = Object.keys(cloudData.points)
    if (!keys.length) return null

    const lats   = keys.map(k => parseFloat(k.split(',')[0]))
    const lons    = keys.map(k => parseFloat(k.split(',')[1]))
    const minLat  = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon  = Math.min(...lons), maxLon = Math.max(...lons)
    const spacing = cloudData.spacing || 0.1

    // Windowed stats — same logic as before
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
      const med = sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2
      const avg = use.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / use.length
      pointStats[k] = { med, avg }
    }

    // Bilinear interpolation on windowed avg — matches threshold data exactly
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

    // Per-anchor thresholds
    const anchorThresholds = ANCHORS.map(anchor => {
      const nearby = keys.filter(k => {
        const [la, lo] = k.split(',').map(parseFloat)
        const d = Math.sqrt(
          (la - anchor.lat) ** 2 +
          ((lo - anchor.lon) * Math.cos(anchor.lat * Math.PI / 180)) ** 2
        )
        return d <= ANCHOR_R
      })
      const meds = nearby
        .map(k => pointStats[k]?.med)
        .filter(v => v != null)
        .sort((a, b) => a - b)
      if (!meds.length) return null
      const qualCount = meds.filter(m => m <= 45).length
      return {
        lat: anchor.lat, lon: anchor.lon,
        longShot: qualCount / meds.length < 0.05,
        p20: meds[Math.floor(meds.length * 0.20)],
        p40: meds[Math.floor(meds.length * 0.40)],
        p60: Math.min(meds[Math.floor(meds.length * 0.60)], 45),
        p05: meds[Math.floor(meds.length * 0.05)],
      }
    }).filter(Boolean)

    const globalLongShot = anchorThresholds.length > 0 && anchorThresholds.every(a => a.longShot)

    // Geographic canvas — each pixel maps linearly to lat/lon
    // No Leaflet projection calls needed — Leaflet's ImageOverlay handles Mercator
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

        const cf = getWindowedAvg(lat, lon)
        if (cf === null) continue

        const edgeDist = Math.min(
          lat - minLat, maxLat - lat,
          lon - minLon, maxLon - lon
        )
        const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)
        const idx = (py * CANVAS_W + px) * 4

        // Normal zone — distance-weighted blend across overlapping anchors
        let totalWeight = 0, weightedAlpha = 0
        for (const a of anchorThresholds) {
          const dist = Math.sqrt(
            (lat - a.lat) ** 2 +
            ((lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) ** 2
          )
          if (dist > ANCHOR_R) continue
          if (cf > a.p60) continue
          const weight = dist < ANCHOR_R - BLEND ? 1 : Math.max(0, (ANCHOR_R - dist) / BLEND)
          if (weight <= 0) continue
          const cfBINS = [
            { maxCf: a.p20, alpha: 153 },
            { maxCf: a.p40, alpha: 95  },
            { maxCf: a.p60, alpha: 45  },
          ]
          let aAlpha = 0
          for (const bin of cfBINS) {
            const lo = bin.maxCf - AA * 100
            const hi = bin.maxCf + AA * 100
            if (cf > hi) continue
            if (cf <= lo) { aAlpha = bin.alpha; break }
            const t = (hi - cf) / (2 * AA * 100)
            const s = t * t * (3 - 2 * t)
            aAlpha = Math.round(aAlpha + (bin.alpha - aAlpha) * s)
            break
          }
          weightedAlpha += aAlpha * weight
          totalWeight   += weight
        }

        if (totalWeight > 0 && weightedAlpha / totalWeight > 2) {
          const alpha = Math.round((weightedAlpha / totalWeight) * edgeFade)
          d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=alpha

        } else {
          // Long Shot — only for anchors in Long Shot mode
          let lsThreshold = null
          for (const a of anchorThresholds) {
            if (!a.longShot) continue
            const dist = Math.sqrt(
              (lat - a.lat) ** 2 +
              ((lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) ** 2
            )
            if (dist <= ANCHOR_R && (lsThreshold === null || a.p05 < lsThreshold))
              lsThreshold = a.p05
          }
          if (lsThreshold === null || cf > lsThreshold + AA * 100) continue
          const t = Math.max(0, Math.min(1, (lsThreshold + AA * 100 - cf) / (2 * AA * 100)))
          const s = t * t * (3 - 2 * t)
          const alpha = Math.round(40 * s * edgeFade)
          if (alpha === 0) continue
          d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
          if (lsPixels) lsPixels[py * CANVAS_W + px] = 1
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)

    // Dashed orange border baked into the image
    if (globalLongShot && lsPixels) {
      ctx.strokeStyle = 'rgba(255,140,0,0.85)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      for (let py = 1; py < CANVAS_H - 1; py++) {
        for (let px = 1; px < CANVAS_W - 1; px++) {
          if (!lsPixels[py * CANVAS_W + px]) continue
          if (
            !lsPixels[(py - 1) * CANVAS_W + px] || !lsPixels[(py + 1) * CANVAS_W + px] ||
            !lsPixels[py * CANVAS_W + px - 1]   || !lsPixels[py * CANVAS_W + px + 1]
          ) {
            ctx.rect(px, py, 1, 1)
          }
        }
      }
      ctx.stroke()
    }

    return {
      dataUrl:  canvas.toDataURL('image/png'),
      bounds:   { minLat, maxLat, minLon, maxLon },
      longShot: globalLongShot,
    }
  }, [cloudData, windowHours])  // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of Long Shot status
  useEffect(() => {
    onLongShot?.(geoImage?.longShot ?? false)
  }, [geoImage?.longShot])  // eslint-disable-line react-hooks/exhaustive-deps

  // Mount / update / unmount the ImageOverlay
  useEffect(() => {
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current)
      overlayRef.current = null
    }
    if (!geoImage?.dataUrl) return

    const { dataUrl, bounds: { minLat, maxLat, minLon, maxLon } } = geoImage
    overlayRef.current = L.imageOverlay(
      dataUrl,
      [[minLat, minLon], [maxLat, maxLon]],
      { opacity: 1, zIndex: 201, interactive: false }
    ).addTo(map)

    return () => {
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [geoImage, map])

  return null
}
