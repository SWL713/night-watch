import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js'

const supabaseReady = !SUPABASE_URL.startsWith('REPLACE_ME')
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

// Bounding box covering Michigan to Maine / Quebec to NJ
const CAMERA_BOUNDS = L.latLngBounds(
  [39.5, -90.0],
  [50.5, -66.0],
)

function makeCameraIcon(isActive) {
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="
      width:36px;height:36px;
      background:${isActive ? '#001a2a' : '#06080f'};
      border:2px solid ${isActive ? '#44aaff' : '#1a4a6a'};
      border-radius:4px;
      display:flex;align-items:center;justify-content:center;
      font-size:18px;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
    ">📹</div>`,
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
        icon: makeCameraIcon(activeId === cam.id),
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
