import { Marker, Popup } from 'react-leaflet'
import { useState, useEffect } from 'react'
import L from 'leaflet'
import { bortleScore, scoreToRGB } from '../utils/scoring.js'
import { getBortle } from '../utils/bortleGrid.js'
import { fetchBortleAt } from '../utils/bortleApi.js'
import SpotCard from './SpotCard.jsx'

function createPin(r, g, b, size) {
  const color = `rgb(${r},${g},${b})`
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid rgba(255,255,255,0.25);
      border-radius:50%;
      box-shadow:0 0 8px ${color}99;
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Bortle score → color (green=dark sky, red=light polluted)
// Same scale as the existing heatmap so pins are visually consistent
function bortleToRGB(bortle) {
  return scoreToRGB(bortleScore(bortle))
}

// Shift a color toward red by cloudFraction (0–1)
function addCloudRed(rgb, cloudFraction) {
  const cf = Math.max(0, Math.min(1, cloudFraction))
  return [
    Math.round(rgb[0] + (200 - rgb[0]) * cf),
    Math.round(rgb[1] + (0   - rgb[1]) * cf),
    Math.round(rgb[2] + (20  - rgb[2]) * cf),
  ]
}

function SpotPin({ spot, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto, mode, bortleGrid }) {
  // Use stored bortle, or look up from grid, or fetch from API as last resort
  const storedBortle = spot.bortle ?? null
  const gridBortle   = bortleGrid ? getBortle(bortleGrid, spot.lat, spot.lon) : null
  const [apiBortle, setApiBortle] = useState(null)

  useEffect(() => {
    // Only hit API if we have neither stored nor grid value
    if (storedBortle !== null || gridBortle !== null) return
    fetchBortleAt(spot.lat, spot.lon).then(b => setApiBortle(b))
  }, [spot.id]) // eslint-disable-line

  const bortle = storedBortle ?? gridBortle ?? apiBortle ?? 5

  // Cloud at this spot
  const cloudPct      = getCloudAt ? (getCloudAt(spot.lat, spot.lon, selectedHour) ?? 0) : 0
  const cloudFraction = Math.max(0, Math.min(1, cloudPct / 100))

  // Color logic per mode
  let rgb
  if (mode === 'bortle') {
    // Pure bortle — matches the tile colors beneath
    rgb = bortleToRGB(bortle)
  } else if (mode === 'clouds') {
    // Pure cloud — green=clear, red=cloudy, bortle irrelevant
    rgb = scoreToRGB(1 - cloudFraction)
  } else {
    // Combined — bortle is baseline, clouds push toward red
    rgb = addCloudRed(bortleToRGB(bortle), cloudFraction)
  }

  // Size: bigger = better sky conditions
  const quality = (1 - cloudFraction) * bortleScore(bortle)
  const size    = 12

  return (
    <Marker
      position={[spot.lat, spot.lon]}
      icon={createPin(rgb[0], rgb[1], rgb[2], size)}
    >
      <Popup minWidth={300} maxWidth={320} className="night-watch-popup">
        <SpotCard
          spot={{ ...spot, bortle }}
          onClose={() => {}}
          spaceWeather={spaceWeather}
          onSubmitPhoto={onSubmitPhoto}
        />
      </Popup>
    </Marker>
  )
}

export default function SpotPins({ spots, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto, mode, bortleGrid }) {
  return (
    <>
      {spots.map(spot => (
        <SpotPin
          key={spot.id}
          spot={spot}
          selectedHour={selectedHour}
          getCloudAt={getCloudAt}
          spaceWeather={spaceWeather}
          onSubmitPhoto={onSubmitPhoto}
          mode={mode}
          bortleGrid={bortleGrid}
        />
      ))}
    </>
  )
}
