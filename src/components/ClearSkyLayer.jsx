// ClearSkyLayer — mounts the pre-rendered clear sky image as a Leaflet ImageOverlay.
//
// All scoring and rendering now lives in useClearSkyImage (run once per cloud data
// update, in App.jsx before the user even opens clear sky mode). This component
// just pins the resulting image to the map's geographic bounds and lets Leaflet
// handle all pan/zoom repositioning — no pixel loops, no moveend listeners.
//
// Props:
//   image      — result from useClearSkyImage({ dataUrl, bounds, longShot })
//   onLongShot — callback(bool) notified when globalLongShot status changes

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

export default function ClearSkyLayer({ image, onLongShot }) {
  const map        = useMap()
  const overlayRef = useRef(null)

  // Notify parent of Long Shot status whenever the image updates
  useEffect(() => {
    onLongShot?.(image?.longShot ?? false)
  }, [image?.longShot])  // eslint-disable-line react-hooks/exhaustive-deps

  // Mount / update / unmount the ImageOverlay as the pre-rendered image changes
  useEffect(() => {
    // Tear down any existing overlay first
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current)
      overlayRef.current = null
    }
    if (!image?.dataUrl) return

    const { dataUrl, bounds: { minLat, maxLat, minLon, maxLon } } = image

    overlayRef.current = L.imageOverlay(
      dataUrl,
      [[minLat, minLon], [maxLat, maxLon]],
      { opacity: 1, zIndex: 201, interactive: false }
    ).addTo(map)

    return () => {
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [image, map])

  return null
}
