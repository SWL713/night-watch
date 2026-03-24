import { WEIGHT_CLOUDS, WEIGHT_BORTLE, CLOUD_FLOOR_THRESHOLD } from '../config.js'

// Bortle 1-9 → normalized 0-1 score (1 = darkest/best)
export function bortleScore(bortle) {
  const b = Math.min(9, Math.max(1, bortle))
  return Math.pow((9 - b) / 8, 1.6)
}

// Cloud cover 0-100% → 0-1 score
export function cloudScore(cloudPct) {
  return 1 - Math.min(100, Math.max(0, cloudPct)) / 100
}

// Combined score 0-1 — true weighted computation, not transparency layering
// Clouds 70% weight, bortle 30% weight
// Hard floor: >=95% cloud = 0 regardless of bortle
export function combinedScore(cloudPct, bortle) {
  if (cloudPct >= CLOUD_FLOOR_THRESHOLD) return 0
  const cScore = cloudScore(cloudPct) * WEIGHT_CLOUDS
  const bScore = bortleScore(bortle)  * WEIGHT_BORTLE
  return Math.min(1, Math.max(0, cScore + bScore))
}

// Color scale designed for aurora hunters:
// Uses cool/warm contrast — NOT green (aurora color) to avoid confusion
// Best → aqua/teal (clear dark sky)
// Good → blue-white
// Fair → yellow
// Poor → orange
// Worst → red/deep red (overcast/bright)
function interpolateColor(score) {
  const stops = [
    [1.00,   0, 220, 180],  // best  — vivid teal/aqua
    [0.82,  40, 200, 240],  // great — cyan-blue
    [0.64,  80, 160, 255],  // good  — sky blue
    [0.48, 220, 210,  60],  // fair  — yellow
    [0.32, 255, 140,   0],  // poor  — amber/orange
    [0.16, 240,  50,   0],  // bad   — red-orange
    [0.00, 180,   0,   0],  // worst — deep red
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
  return [180, 0, 0]
}

export function scoreToRGB(score)              { return interpolateColor(score) }
export function scoreToColor(score, alpha=0.65) {
  const [r, g, b] = interpolateColor(score)
  return `rgba(${r},${g},${b},${alpha})`
}

export function scoreToLabel(score) {
  if (score >= 0.75) return 'Excellent'
  if (score >= 0.55) return 'Good'
  if (score >= 0.35) return 'Fair'
  if (score >= 0.18) return 'Poor'
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

export function intensityRank(label) {
  const ranks = { 'Calm':0,'Weak':1,'Mild':2,'Moderate':3,'Strong':4,'Very Strong':5,'Extreme':6 }
  return ranks[label] ?? 0
}
