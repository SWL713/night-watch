import { WEIGHT_CLOUDS, WEIGHT_BORTLE, CLOUD_FLOOR_THRESHOLD } from '../config.js'

// Bortle 1-9 → normalized 0-1 score (1 = darkest/best)
// Calibrated so Bortle 2 (best realistic NE sky) → 1.0
// Steeper falloff at B5+ so light-polluted areas read clearly as bad
export function bortleScore(bortle) {
  const b = Math.min(9, Math.max(1, bortle))
  // Remap B2=1.0, B9=0.0 with power 2.0 for steep urban falloff
  const remapped = Math.max(0, 9 - b) / 7
  return Math.min(1, Math.pow(remapped, 2.0))
}

// Cloud cover 0-100% → 0-1 score
export function cloudScore(cloudPct) {
  return 1 - Math.min(100, Math.max(0, cloudPct)) / 100
}

// Combined score 0-1 — weighted sum, not transparency layering
export function combinedScore(cloudPct, bortle) {
  if (cloudPct >= CLOUD_FLOOR_THRESHOLD) return 0
  const cScore = cloudScore(cloudPct) * WEIGHT_CLOUDS
  const bScore = bortleScore(bortle)  * WEIGHT_BORTLE
  return Math.min(1, Math.max(0, cScore + bScore))
}

// Unified color scale for both bortle and cloud layers
// Score 1.0 → vivid emerald green (best conditions)
// Score 0.0 → deep red (worst conditions)
// Same stops used for all modes — consistent visual language
function interpolateColor(score) {
  const stops = [
    [1.00,   0, 200,  80],  // vivid emerald   — perfect (B2 dark, clear)
    [0.80,  80, 210,  30],  // lime green       — excellent
    [0.60, 170, 210,   0],  // yellow-green     — good
    [0.42, 220, 180,   0],  // golden amber     — fair
    [0.26, 250, 110,   0],  // orange           — poor
    [0.12, 240,  40,  10],  // red-orange       — bad
    [0.00, 190,   0,  20],  // deep red         — worst
  ]

  const s = Math.max(0, Math.min(1, score))
  for (let i = 0; i < stops.length - 1; i++) {
    const [hi, r1, g1, b1] = stops[i]
    const [lo, r2, g2, b2] = stops[i + 1]
    if (s >= lo && s <= hi) {
      const t = (s - lo) / (hi - lo)
      return [
        Math.round(r1 + (r2 - r1) * (1 - t)),
        Math.round(g1 + (g2 - g1) * (1 - t)),
        Math.round(b1 + (b2 - b1) * (1 - t)),
      ]
    }
  }
  return [190, 0, 20]
}

export function scoreToRGB(score)               { return interpolateColor(score) }
export function scoreToColor(score, alpha=0.65) {
  const [r, g, b] = interpolateColor(score)
  return `rgba(${r},${g},${b},${alpha})`
}
export function scoreToLabel(score) {
  if (score >= 0.80) return 'Excellent'
  if (score >= 0.60) return 'Good'
  if (score >= 0.40) return 'Fair'
  if (score >= 0.20) return 'Poor'
  return 'Very Poor'
}
export function pinColor(score) {
  const [r, g, b] = interpolateColor(score)
  return `rgb(${r},${g},${b})`
}
export function locationScore(spot) {
  const bScore = bortleScore(spot.bortle)
  const hScore = (spot.horizon_rating || 3) / 5
  return (bScore * 0.6 + hScore * 0.4)
}

// Verify calibration
// Bortle 2 → score should be ~1.0 (full green)
// Bortle 5 → score should be ~0.45 (amber)
// Bortle 9 → score should be 0.0 (red)
