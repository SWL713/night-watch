import { WEIGHT_CLOUDS, WEIGHT_BORTLE, CLOUD_FLOOR_THRESHOLD } from '../config.js'

// Bortle scale 1-9 → normalized 0-1 (1 = best/darkest)
export function bortleScore(bortle) {
  return 1 - (Math.min(9, Math.max(1, bortle)) - 1) / 8
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

// Score → color (green=good, yellow=ok, red=bad)
export function scoreToColor(score, alpha = 0.65) {
  if (score >= 0.70) return `rgba(34, 197, 94, ${alpha})`   // green
  if (score >= 0.50) return `rgba(134, 197, 34, ${alpha})`  // yellow-green
  if (score >= 0.35) return `rgba(234, 179, 8, ${alpha})`   // amber
  if (score >= 0.20) return `rgba(249, 115, 22, ${alpha})`  // orange
  return `rgba(239, 68, 68, ${alpha})`                       // red
}

// Score → label
export function scoreToLabel(score) {
  if (score >= 0.70) return 'Excellent'
  if (score >= 0.50) return 'Good'
  if (score >= 0.35) return 'Fair'
  if (score >= 0.20) return 'Poor'
  return 'Very Poor'
}

// Pin color based on combined score
export function pinColor(score) {
  if (score >= 0.70) return '#22c55e'
  if (score >= 0.50) return '#86c522'
  if (score >= 0.35) return '#eab308'
  if (score >= 0.20) return '#f97316'
  return '#ef4444'
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
