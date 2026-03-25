import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, bortleScore, scoreToRGB, scoreToLabel } from '../utils/scoring.js'
import { getBortle } from '../utils/bortleGrid.js'
import SpotCard from './SpotCard.jsx'

function createPin(color, size) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid rgba(255,255,255,0.25);
      border-radius:50%;
      box-shadow:0 0 8px ${color}99;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Compute the exact same score the heatmap uses at this lat/lon/hour/mode
function spotScore(spot, mode, getCloudAt, selectedHour, bortleGrid) {
  const bortle = bortleGrid
    ? getBortle(bortleGrid, spot.lat, spot.lon)
    : (spot.bortle ?? 5)

  const bScore = bortleScore(bortle)

  if (mode === 'bortle') return bScore

  const cloud = getCloudAt ? getCloudAt(spot.lat, spot.lon, selectedHour) : null
  const adjusted = cloud === null ? null : (cloud < 20 ? 0 : (cloud - 20) / 80 * 100)
  const cScore = adjusted === null ? null : 1 - adjusted / 100

  if (mode === 'clouds') return cScore ?? null

  // Combined: 70% cloud + 30% bortle
  if (cScore === null) return Math.pow(bScore * 0.5 + 0.5, 0.65)
  if (cScore <= 0) return 0
  const cloudPenalty = Math.pow(cScore, 1.5)
  return Math.pow(cloudPenalty * 0.8 + bScore * 0.2, 0.65)
}

export default function SpotPins({ spots, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto, mode, bortleGrid }) {
  return (
    <>
      {spots.map(spot => {
        const score  = spotScore(spot, mode, getCloudAt, selectedHour, bortleGrid)
        const [r, g, b] = scoreToRGB(score)
        const color  = `rgb(${r},${g},${b})`
        const size   = 11 + Math.round(score * 6)  // larger = better conditions

        return (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lon]}
            icon={createPin(color, size)}
          >
            <Popup
              minWidth={300}
              maxWidth={320}
              className="night-watch-popup"
            >
              <SpotCard
                spot={spot}
                onClose={() => {}}
                spaceWeather={spaceWeather}
                onSubmitPhoto={onSubmitPhoto}
              />
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}
