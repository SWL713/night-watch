import { WEIGHT_CLOUDS, WEIGHT_BORTLE, CLOUD_FLOOR_THRESHOLD } from '../config.js'

// Bortle scale 1-9 → normalized 0-1 (1 = best/darkest)
// Uses a non-linear curve that stretches the 1-5 range (where decisions matter)
// and compresses 6-9 (all bad for aurora hunting)
//
// Bortle:  1     2     3     4     5     6     7     8     9
// Score: 1.00  0.90  0.78  0.64  0.48  0.30  0.18  0.08  0.00
//
// This means bortle 1 vs 2 vs 3 show clearly different colors
// while 7/8/9 are all clearly bad (red/dark orange)
export function bortleScore(bortle) {
  const b = Math.min(9, Math.max(1, bortle))
  // Quadratic curve — steeper in the good range
  return Math.pow((9 - b) / 8, 1.6)
}

// Cloud cover 0-100% → normalized 0-1 (0% cloud = 1.0 score)
export function cloudScore(cloudPct) {
  return 1 - Math.min(100, Math.max(0, cloudPct)) / 100
}

// Combined score 0-1
// Hard penalty: >= CLOUD_FLOOR_THRESHOLD cloud cover floors to 0
export function combinedScore(cloudPct, bortle) {
  if (cloudPct >= CLOUD_FLOOR_THRESHOLD) return 0
  const cScore = cloudScore(cloudPct) * WEIGHT_CLOUDS
  const bScore = bortleScore(bortle)  * WEIGHT_BORTLE
  return Math.min(1, Math.max(0, cScore + bScore))
}

// Smooth RGB interpolation between color stops
// More stops = more distinct colors across the range
function interpolateColor(score) {
  // Color stops: [score_threshold, r, g, b]
  const stops = [
    [1.00,  0, 210,  80],  // Bortle 1 — vivid emerald green
    [0.88, 60, 220,  50],  // Bortle 2 — bright lime green
    [0.74, 140, 210, 20],  // Bortle 3 — yellow-green
    [0.58, 200, 190,  0],  // Bortle 4 — golden yellow
    [0.42, 240, 160,  0],  // Bortle 5 — amber
    [0.28, 250, 100,  0],  // Bortle 6 — orange
    [0.14, 240,  50,  0],  // Bortle 7 — red-orange
    [0.00, 210,  30, 30],  // Bortle 8-9 — deep red
  ]

  const s = Math.max(0, Math.min(1, score))

  // Find surrounding stops and interpolate
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
  return [210, 30, 30]
}

// Score → RGB array [r, g, b] — used by HeatmapLayer
export function scoreToRGB(score) {
  return interpolateColor(score)
}

// Score → rgba string — used by SpotCard etc
export function scoreToColor(score, alpha = 0.65) {
  const [r, g, b] = interpolateColor(score)
  return `rgba(${r},${g},${b},${alpha})`
}

// Score → label
export function scoreToLabel(score) {
  if (score >= 0.75) return 'Excellent'
  if (score >= 0.55) return 'Good'
  if (score >= 0.35) return 'Fair'
  if (score >= 0.18) return 'Poor'
  return 'Very Poor'
}

// Pin color based on combined score
export function pinColor(score) {
  const [r, g, b] = interpolateColor(score)
  return `rgb(${r},${g},${b})`
}

// Location score (static, 0-1) from spot data
export function locationScore(spot) {
  const bScore = bortleScore(spot.bortle)
  const hScore = (spot.horizon_rating || 3) / 5
  return (bScore * 0.6 + hScore * 0.4)
}

// Aurora intensity label → numeric 0-6
export function intensityRank(label) {
  const ranks = { 'Calm':0,'Weak':1,'Mild':2,'Moderate':3,'Strong':4,'Very Strong':5,'Extreme':6 }
  return ranks[label] ?? 0
}
