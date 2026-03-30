// useClearSkyImage — geographic pre-render of clear sky scoring
//
// Renders the clear sky overlay into a fixed geographic canvas (not screen-space)
// and returns a data URL that Leaflet mounts as an ImageOverlay.
//
// WHY: The old ClearSkyLayer iterated every screen pixel on every pan/zoom.
// At 3× DPR on mobile that was ~3M iterations per map move, all on the main thread.
// This hook runs the same scoring math once into a 600×400 geographic canvas,
// then Leaflet handles all pan/zoom repositioning automatically — zero pixel work
// on map moves.
//
// WHEN IT RE-RUNS: Only when cloudData or windowHours changes (≈every 30 min,
// or when user toggles 4H/8H). A 150ms debounce prevents stacking rapid changes.
//
// FUTURE: If the 600×400 render loop (≈240k pixels × 7 anchors) is still felt on
// old/slow devices, move it into a Web Worker. The hook interface stays identical —
// just swap the synchronous loop for a worker postMessage round-trip.

import { useState, useEffect } from 'react'

// Geographic canvas resolution — rendering at ~5× data grid density is plenty smooth
// for a gradient overlay. Bump to 900×600 if zones ever look blurry at high zoom.
const CANVAS_W = 600
const CANVAS_H = 400

// Anchor points and radii — must stay in sync with ClearSkyLayer spec
const ANCHORS = [
  { lat: 42.9, lon: -78.9 },  // Buffalo
  { lat: 43.0, lon: -76.1 },  // Syracuse
  { lat: 43.0, lon: -73.8 },  // Albany
  { lat: 44.5, lon: -73.2 },  // Burlington
  { lat: 42.4, lon: -71.1 },  // Boston
  { lat: 40.7, lon: -74.0 },  // NYC
  { lat: 39.9, lon: -75.2 },  // Philadelphia
]
const ANCHOR_R = 150 / 69    // 150 miles in degrees lat
const BLEND    = 30  / 69    // 30-mile soft blend zone at anchor edges
const AA       = 0.015       // anti-aliasing half-width for bin edges (fraction of 100)
const FADE     = 0.5         // edge fade width in degrees

// Python writes integer coords with .0 suffix; replicate that format for key lookups
function pyFmt(v) {
  const s = v.toString()
  return s.includes('.') ? s : s + '.0'
}

export function useClearSkyImage(cloudData, windowHours) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    // 150ms debounce — rapid windowHours toggles or back-to-back cloudData updates
    // only fire one render, not several stacked ones
    const timer = setTimeout(() => {
      if (!cloudData?.points) { setResult(null); return }

      const keys = Object.keys(cloudData.points)
      if (!keys.length) { setResult(null); return }

      // ── Geographic bounds from actual data keys ──────────────────────────────
      const lats = keys.map(k => parseFloat(k.split(',')[0]))
      const lons  = keys.map(k => parseFloat(k.split(',')[1]))
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const minLon = Math.min(...lons), maxLon = Math.max(...lons)
      const spacing = cloudData.spacing || 0.1

      // ── Per-point windowed stats ─────────────────────────────────────────────
      // Same windowing logic as ClearSkyLayer — median cloud cover for threshold
      // calculation, avg for the per-pixel interpolation that drives color.
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

      // ── Bilinear interpolation on windowed avg ───────────────────────────────
      // Mirrors getWindowedAvg from old ClearSkyLayer exactly — uses same key
      // format and corner-weight logic so output is pixel-identical.
      function getWindowedAvg(lat, lon) {
        const lat0 = parseFloat((Math.floor(lat / spacing) * spacing).toFixed(2))
        const lon0 = parseFloat((Math.floor(lon / spacing) * spacing).toFixed(2))
        const lat1 = parseFloat((lat0 + spacing).toFixed(2))
        const lon1 = parseFloat((lon0 + spacing).toFixed(2))
        const tx = (lon - lon0) / spacing
        const ty = (lat - lat0) / spacing

        // Key format must match Python output ("39.0" not "39")
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

      // ── Per-anchor thresholds ────────────────────────────────────────────────
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
        const anchorLongShot = qualCount / meds.length < 0.05

        return {
          lat: anchor.lat, lon: anchor.lon,
          longShot: anchorLongShot,
          p20: meds[Math.floor(meds.length * 0.20)],
          p40: meds[Math.floor(meds.length * 0.40)],
          p60: Math.min(meds[Math.floor(meds.length * 0.60)], 45),
          p05: meds[Math.floor(meds.length * 0.05)],
        }
      }).filter(Boolean)

      // Global Long Shot = ALL anchors in Long Shot mode (drives banner + key)
      const globalLongShot = anchorThresholds.length > 0 && anchorThresholds.every(a => a.longShot)

      // ── Geographic canvas render ─────────────────────────────────────────────
      // Each pixel maps linearly to lat/lon — no Leaflet projection calls needed.
      // Leaflet's ImageOverlay handles Mercator repositioning automatically.
      // At 40-48°N the linear→Mercator distortion is <5% and invisible on a
      // blurry gradient overlay. If precise alignment ever matters, render in
      // Mercator space instead.
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
        // Linear lat mapping: top = maxLat, bottom = minLat
        const lat = maxLat - (py / (CANVAS_H - 1)) * latSpan

        for (let px = 0; px < CANVAS_W; px++) {
          // Linear lon mapping: left = minLon, right = maxLon
          const lon = minLon + (px / (CANVAS_W - 1)) * lonSpan

          const cf = getWindowedAvg(lat, lon)
          if (cf === null) continue

          // Edge fade — same 0.5° rolloff as the old pixel loop
          const edgeDist = Math.min(
            lat - minLat, maxLat - lat,
            lon - minLon, maxLon - lon
          )
          const edgeFade = Math.pow(Math.max(0, Math.min(1, edgeDist / FADE)), 0.4)
          const idx = (py * CANVAS_W + px) * 4

          // ── Normal zone: distance-weighted blend across overlapping anchors ──
          // Same logic as old ClearSkyLayer — normal zones always win over Long Shot
          let totalWeight = 0, weightedAlpha = 0
          for (const a of anchorThresholds) {
            const dist = Math.sqrt(
              (lat - a.lat) ** 2 +
              ((lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) ** 2
            )
            if (dist > ANCHOR_R) continue
            if (cf > a.p60) continue
            // Full weight inside (R - BLEND), tapers to 0 at R
            const weight = dist < ANCHOR_R - BLEND
              ? 1
              : Math.max(0, (ANCHOR_R - dist) / BLEND)
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
              // Smooth step anti-aliasing at bin edges
              const t = (hi - cf) / (2 * AA * 100)
              const s = t * t * (3 - 2 * t)
              aAlpha = Math.round(aAlpha + (bin.alpha - aAlpha) * s)
              break
            }
            weightedAlpha += aAlpha * weight
            totalWeight   += weight
          }

          if (totalWeight > 0 && weightedAlpha / totalWeight > 2) {
            // Normal teal zone — rgb(0, 210, 160)
            const alpha = Math.round((weightedAlpha / totalWeight) * edgeFade)
            d[idx]=0; d[idx+1]=210; d[idx+2]=160; d[idx+3]=alpha

          } else {
            // ── Long Shot: only for anchors that are in Long Shot mode ─────────
            // If any anchor covering this pixel has real results, no Long Shot here
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

            // Long Shot warm teal — rgb(150, 210, 120)
            d[idx]=150; d[idx+1]=210; d[idx+2]=120; d[idx+3]=alpha
            if (lsPixels) lsPixels[py * CANVAS_W + px] = 1
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)

      // ── Dashed orange border around Long Shot zones (baked into the image) ──
      if (globalLongShot && lsPixels) {
        ctx.strokeStyle = 'rgba(255,140,0,0.85)'
        ctx.lineWidth   = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        for (let py = 1; py < CANVAS_H - 1; py++) {
          for (let px = 1; px < CANVAS_W - 1; px++) {
            if (!lsPixels[py * CANVAS_W + px]) continue
            // Edge pixel = has a neighbor that is NOT a Long Shot pixel
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

      setResult({
        dataUrl:   canvas.toDataURL('image/png'),
        bounds:    { minLat, maxLat, minLon, maxLon },
        longShot:  globalLongShot,
      })
    }, 150)

    return () => clearTimeout(timer)
  }, [cloudData, windowHours])

  return result
}
