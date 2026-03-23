import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { combinedScore, locationScore, pinColor, scoreToLabel } from '../utils/scoring.js'
import SpotCard from './SpotCard.jsx'

function createPin(color, size = 12) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid #ffffff33;
      border-radius:50%;
      box-shadow:0 0 6px ${color}88;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  })
}

export default function SpotPins({ spots, selectedHour, getCloudAt, spaceWeather, onSubmitPhoto }) {
  return (
    <>
      {spots.map(spot => {
        const cloud = getCloudAt ? getCloudAt(
          parseFloat(spot.lat.toFixed(2)),
          parseFloat(spot.lon.toFixed(2)),
          selectedHour
        ) : 50
        const chaseScore = combinedScore(cloud, spot.bortle)
        const locScore = locationScore(spot)
        const color = pinColor(chaseScore)
        // Pin size scales with location score (3=small 4=medium 5=large)
        const size = Math.round(10 + locScore * 8)

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
