import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase, supabaseReady } from '../lib/supabase.js'

// Bounding box covering Michigan to Maine / Quebec to NJ
const CAMERA_BOUNDS = L.latLngBounds(
  [39.5, -90.0],
  [50.5, -66.0],
)

function makeCameraIcon(isActive, cameraType) {
  const emoji = cameraType === 'airport' ? '✈️'
              : cameraType === 'allsky'   ? '🔭'
              : '📹'
  const borderColor = isActive ? '#44aaff'
    : cameraType === 'airport' ? '#4a6a8a'
    : cameraType === 'allsky'  ? '#2a6a4a'
    : '#1a4a6a'
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="
      width:36px;height:36px;
      background:${isActive ? '#001a2a' : '#06080f'};
      border:2px solid ${borderColor};
      border-radius:4px;
      display:flex;align-items:center;justify-content:center;
      font-size:18px;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
    ">${emoji}</div>`,
  })
}

export default function CameraLayer({ onCameraClick, activeId }) {
  const map = useMap()
  const markersRef = useRef([])
  const didZoomRef = useRef(false)
  const [cameras, setCameras] = useState([])

  // Fetch cameras from Supabase
  useEffect(() => {
    if (!supabase) return
    supabase
      .from('live_cams')
      .select('*')
      .eq('is_active', true)
      .order('id')
      .then(({ data, error }) => {
        if (!error && data) setCameras(data)
      })
  }, [])

  // Zoom to camera region on first mount
  useEffect(() => {
    if (!didZoomRef.current) {
      map.fitBounds(CAMERA_BOUNDS, { padding: [40, 40], animate: true, duration: 1.0 })
      didZoomRef.current = true
    }
  }, [map])

  // Place markers whenever cameras load or activeId changes
  useEffect(() => {
    // Remove old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    cameras.forEach(cam => {
      const marker = L.marker([cam.lat, cam.lon], {
        icon: makeCameraIcon(activeId === cam.id, cam.camera_type),
        zIndexOffset: 500,
      })
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        onCameraClick(cam)
      })
      marker.addTo(map)
      markersRef.current.push(marker)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
    }
  }, [map, cameras, onCameraClick, activeId])

  return null
}
