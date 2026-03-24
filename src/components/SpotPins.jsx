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
  // Use bortle from the high-res grid if available, fall back to spot.bortle
  const bortle = bortleGrid
    ? getBortle(bortleGrid, spot.lat, spot.lon)
    : (spot.bortle ?? 5)

  if (mode === 'bortle') return bortleScore(bortle)

  const cloud = getCloudAt
    ? getCloudAt(spot.lat, spot.lon, selectedHour)
    : null

  if (mode === 'clouds') {
    return cloud !== null ? 1 - cloud / 100 : bortleScore(bortle) * 0.7
  }

  // Combined — matches HeatmapLayer exactly
  if (cloud === null) return bortleScore(bortle) * 0.7
  return combinedScore(cloud, bortle)
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
