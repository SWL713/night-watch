// UserLocationLayer — shows user's live location as a pulsing teal crosshair dot.
// Requests geolocation on mount, watches for updates, cleans up on unmount.
// No new module boundaries — only imports react-leaflet and leaflet, same as other layers.

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

function makeLocationIcon() {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
      <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        <!-- Pulsing ring -->
        <div class="nw-location-pulse" style="
          position:absolute;
          width:20px;height:20px;
          border-radius:50%;
          border:2px solid rgba(68,221,170,0.6);
          top:2px;left:2px;
        "></div>
        <!-- Solid center dot -->
        <div style="
          width:10px;height:10px;
          border-radius:50%;
          background:#44ddaa;
          border:2px solid #06080f;
          box-shadow:0 0 6px rgba(68,221,170,0.8);
          position:relative;z-index:1;
        "></div>
        <!-- Crosshair arms -->
        <div style="position:absolute;top:50%;left:0;width:5px;height:1px;background:#44ddaa;transform:translateY(-50%);opacity:0.7;"></div>
        <div style="position:absolute;top:50%;right:0;width:5px;height:1px;background:#44ddaa;transform:translateY(-50%);opacity:0.7;"></div>
        <div style="position:absolute;left:50%;top:0;height:5px;width:1px;background:#44ddaa;transform:translateX(-50%);opacity:0.7;"></div>
        <div style="position:absolute;left:50%;bottom:0;height:5px;width:1px;background:#44ddaa;transform:translateX(-50%);opacity:0.7;"></div>
      </div>
    `,
  })
}

export default function UserLocationLayer({ onLocationUpdate }) {
  const map = useMap()
  const markerRef = useRef(null)
  const watchRef  = useRef(null)

  useEffect(() => {
    if (!navigator.geolocation) return

    function onPosition(pos) {
      const { latitude: lat, longitude: lng } = pos.coords

      // Notify parent so recenter button knows current coords
      onLocationUpdate?.({ lat, lng })

      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lng], {
          icon: makeLocationIcon(),
          zIndexOffset: 1000,
          interactive: false,
        }).addTo(map)
      } else {
        markerRef.current.setLatLng([lat, lng])
      }
    }

    function onError() {
      // Permission denied or unavailable — silently do nothing
    }

    // Initial fix
    navigator.geolocation.getCurrentPosition(onPosition, onError, {
      enableHighAccuracy: true, timeout: 10000,
    })

    // Watch for movement
    watchRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true, timeout: 10000,
    })

    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
    }
  }, [map])

  return null
}
