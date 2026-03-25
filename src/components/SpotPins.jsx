import { Marker, Popup } from 'react-leaflet'
import { useState, useEffect } from 'react'
import L from 'leaflet'
import { bortleToTileColor, applyCloudToColor, fetchBortleAt } from '../utils/bortleApi.js'
import SpotCard from './SpotCard.jsx'

function createPin(rgb, size) {
  const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
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

// Single pin — manages its own bortle lookup if not stored
function SpotPin({ spot, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto, mode }) {
  const [bortle, setBortle] = useState(spot.bortle ?? null)

  // Fetch bortle if not stored on spot
  useEffect(() => {
    if (bortle !== null) return
    fetchBortleAt(spot.lat, spot.lon).then(b => setBortle(b))
  }, [spot.id]) // eslint-disable-line

  const b = bortle ?? 5  // default while loading

  // Cloud fraction at this spot right now
  const cloudPct = getCloudAt ? (getCloudAt(spot.lat, spot.lon, selectedHour) ?? 0) : 0
  const cloudFraction = Math.max(0, Math.min(1, cloudPct / 100))

  // Base color from bortle (matches tile palette), shifted red by clouds
  const baseColor  = bortleToTileColor(b)
  const pinColor   = (mode === 'clouds')
    ? applyCloudToColor([0, 200, 80], cloudFraction)   // clouds-only: start green
    : applyCloudToColor(baseColor, cloudFraction)       // bortle/combined: start at tile color

  // Pin size: bigger = better (less cloudy + darker sky)
  const quality = (1 - cloudFraction) * (1 - (b - 1) / 8)
  const size = 10 + Math.round(quality * 7)

  return (
    <Marker
      key={spot.id}
      position={[spot.lat, spot.lon]}
      icon={createPin(pinColor, size)}
    >
      <Popup minWidth={300} maxWidth={320} className="night-watch-popup">
        <SpotCard
          spot={{ ...spot, bortle: b }}
          onClose={() => {}}
          spaceWeather={spaceWeather}
          onSubmitPhoto={onSubmitPhoto}
        />
      </Popup>
    </Marker>
  )
}

export default function SpotPins({ spots, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto, mode }) {
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
        />
      ))}
    </>
  )
}
