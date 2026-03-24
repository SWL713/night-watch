import { Polyline, Tooltip } from 'react-leaflet'

export default function OvationLines({ spaceWeather, selectedHour }) {
  const oval     = spaceWeather?.ovation_oval     || []
  const viewLine = spaceWeather?.ovation_viewline  || []
  const obsTime  = spaceWeather?.ovation_obs_time  || null

  if (!oval.length && !viewLine.length) return null

  const timeLabel = obsTime
    ? `${new Date(obsTime).toUTCString().slice(17, 22)} UTC`
    : ''

  // Sort by longitude and split at antimeridian to avoid lines crossing the map
  function sortAndSplit(points) {
    if (!points.length) return []
    const sorted = [...points].sort((a, b) => a[1] - b[1])
    // Split into segments where longitude jumps > 10 degrees (antimeridian wrap)
    const segments = []
    let current = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.abs(sorted[i][1] - sorted[i-1][1])
      if (gap > 10) {
        segments.push(current)
        current = [sorted[i]]
      } else {
        current.push(sorted[i])
      }
    }
    segments.push(current)
    return segments.filter(s => s.length > 1)
  }

  const ovalSegments = sortAndSplit(oval)
  const viewSegments = sortAndSplit(viewLine)

  return (
    <>
      {ovalSegments.map((seg, i) => (
        <Polyline
          key={`oval-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 2.5, opacity: 0.85 }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily:'monospace', fontSize:11 }}>
              ● Ovation Model — Oval Boundary<br/>
              Aurora overhead at this line<br/>
              {selectedHour !== 0 && <span style={{color:'#ffcc44'}}>⚠ Current position only — no hourly forecast<br/></span>}
              {timeLabel && `Updated: ${timeLabel}`}
            </span>
          </Tooltip>
        </Polyline>
      ))}

      {viewSegments.map((seg, i) => (
        <Polyline
          key={`view-${i}`}
          positions={seg}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.45, dashArray: '6 4' }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              ◌ Ovation Model — Visibility Limit<br/>
              Aurora visible on horizon north of this line<br/>
              {timeLabel && `Updated: ${timeLabel}`}
            </span>
          </Tooltip>
        </Polyline>
      ))}
    </>
  )
}
