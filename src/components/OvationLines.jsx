import { useEffect, useState } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'
import { fetchOvationBoundaries } from '../utils/ovation.js'

export default function OvationLines() {
  const [data, setData] = useState({ ovalBoundary: [], viewLine: [], observationTime: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOvationBoundaries().then(d => { setData(d); setLoading(false) })
    // Refresh every 10 minutes — Ovation updates every 10min
    const interval = setInterval(() => {
      fetchOvationBoundaries().then(setData)
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading || (!data.ovalBoundary.length && !data.viewLine.length)) return null

  return (
    <>
      {/* Oval boundary — where aurora is overhead */}
      {data.ovalBoundary.length > 1 && (
        <Polyline
          positions={data.ovalBoundary}
          pathOptions={{ color: '#44ddaa', weight: 2.5, opacity: 0.85, dashArray: null }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              ● Aurora Oval Boundary<br/>
              {data.observationTime && `Updated: ${data.observationTime}`}
            </span>
          </Tooltip>
        </Polyline>
      )}

      {/* Viewline — equatorward visibility limit */}
      {data.viewLine.length > 1 && (
        <Polyline
          positions={data.viewLine}
          pathOptions={{ color: '#44ddaa', weight: 1.5, opacity: 0.45, dashArray: '6 4' }}
        >
          <Tooltip sticky>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              ◌ Aurora Viewline (visibility limit)<br/>
              Aurora visible to the north of this line
            </span>
          </Tooltip>
        </Polyline>
      )}
    </>
  )
}
