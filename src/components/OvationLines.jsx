import { Polyline, Tooltip } from 'react-leaflet'

// Reads Ovation Prime data from space_weather.json (fetched by pipeline hourly)
// No CORS issues, no browser-side API calls needed.

export default function OvationLines({ spaceWeather }) {
  const oval     = spaceWeather?.ovation_oval     || []
  const viewLine = spaceWeather?.ovation_viewline  || []
  const obsTime  = spaceWeather?.ovation_obs_time  || null

  if (!oval.length && !viewLine.length) return null

  const timeLabel = obsTime
    ? `Updated: ${new Date(obsTime).toUTCString().slice(17, 22)} UTC`
    : ''

  return (
    <>
      {oval.length > 1 && (
        <Polyline
          positions={oval}
          pathOptions={{ color: '#44ddaa', weight: 2.5, opacity: 0.85 }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              ● Ovation Model — Oval Boundary<br/>
              Aurora overhead at this line<br/>
              {timeLabel}
            </span>
          </Tooltip>
        </Polyline>
      )}

      {viewLine.length > 1 && (
        <Polyline
          positions={viewLine}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.45, dashArray: '6 4' }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              ◌ Ovation Model — Visibility Limit<br/>
              Aurora visible on horizon north of this line<br/>
              {timeLabel}
            </span>
          </Tooltip>
        </Polyline>
      )}
    </>
  )
}
