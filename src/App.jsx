import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import Auth, { useAuth } from './components/Auth.jsx'
import TimelinePanel from './components/TimelinePanel.jsx'
import TimeSlider from './components/TimeSlider.jsx'
import Badges from './components/Badges.jsx'
import LayerControls, { initLayers } from './components/LayerControls.jsx'
import HeatmapLayer from './components/HeatmapLayer.jsx'
import OvationLines from './components/OvationLines.jsx'
import SpotPins from './components/SpotPins.jsx'
import SubmitSpot from './components/SubmitSpot.jsx'
import SubmitPhoto from './components/SubmitPhoto.jsx'
import AdminQueue from './components/AdminQueue.jsx'

import { useSpaceWeather } from './hooks/useSpaceWeather.js'
import { useSpots } from './hooks/useSpots.js'
import { useCloudCover } from './hooks/useCloudCover.js'
import { getMoonData } from './utils/moon.js'
import { MAP_BOUNDS } from './config.js'

// Fix Leaflet default marker icon path issue with Vite
import L from 'leaflet'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

// Admin passphrase — change this to your own admin password
const ADMIN_PHRASE = 'nwadmin2026'

export default function AppWrapper() {
  const { authed, login } = useAuth()
  const [, forceUpdate] = useState(0)

  if (!authed) return <Auth onAuth={() => forceUpdate(n => n + 1)} />
  return <App />
}

function App() {
  const [selectedHour, setSelectedHour] = useState(0)
  const [layers, setLayers] = useState(initLayers())
  const [modal, setModal] = useState(null) // null | 'submitSpot' | 'submitPhoto' | 'admin'
  const [selectedSpotForPhoto, setSelectedSpotForPhoto] = useState(null)
  const [adminInput, setAdminInput] = useState('')
  const [adminAuthed, setAdminAuthed] = useState(false)

  const { data: sw } = useSpaceWeather()
  const { spots } = useSpots()
  const { getCloudAt, loading: cloudLoading, progress } = useCloudCover()
  const moonData = getMoonData()

  // Determine active heatmap mode from layer toggles
  const heatmapMode = layers.clouds ? 'clouds' : layers.bortle ? 'bortle' : 'combined'

  function toggleLayer(key) {
    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      // Exclusive toggle for map modes — turning on clouds/bortle turns off others
      if (key === 'clouds' && next.clouds) next.bortle = false
      if (key === 'bortle' && next.bortle) next.clouds = false
      return next
    })
  }

  const handleSubmitPhoto = useCallback((spot) => {
    setSelectedSpotForPhoto(spot)
    setModal('submitPhoto')
  }, [])

  function handleAdminLogin(e) {
    e.preventDefault()
    if (adminInput.trim() === ADMIN_PHRASE) {
      setAdminAuthed(true)
      setModal('admin')
    }
    setAdminInput('')
  }

  const heatmapActive = layers.heatmap || layers.clouds || layers.bortle

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#06080f',
      fontFamily: FONT, overflow: 'hidden',
    }}>
      {/* Timeline panel */}
      <TimelinePanel
        spaceWeather={sw}
        selectedHour={selectedHour}
        onHourSelect={setSelectedHour}
        moonData={moonData}
      />

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[MAP_BOUNDS.center[0], MAP_BOUNDS.center[1]]}
          zoom={MAP_BOUNDS.zoom}
          minZoom={MAP_BOUNDS.minZoom}
          maxZoom={MAP_BOUNDS.maxZoom}
          zoomControl={false}
          style={{ height: '100%', width: '100%', background: '#06080f' }}
        >
          {/* Dark base tile layer */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            opacity={0.8}
          />

          <ZoomControl position="bottomright" />

          {/* Heatmap */}
          {heatmapActive && (
            <HeatmapLayer
              mode={heatmapMode}
              selectedHour={selectedHour}
              getCloudAt={getCloudAt}
              cloudLoading={cloudLoading}
            />
          )}

          {/* Ovation lines */}
          {layers.ovation && <OvationLines />}

          {/* Spot pins */}
          {layers.pins && (
            <SpotPins
              spots={spots}
              selectedHour={selectedHour}
              getCloudAt={getCloudAt}
              spaceWeather={sw}
              onSubmitPhoto={handleSubmitPhoto}
            />
          )}
        </MapContainer>

        {/* Badges top-right */}
        <Badges spaceWeather={sw} />

        {/* Layer controls bottom-left */}
        <LayerControls
          layers={layers}
          onToggle={toggleLayer}
          enlilActive={sw.enlil_active}
        />

        {/* Cloud loading indicator */}
        {cloudLoading && (
          <div style={{
            position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
            background: '#070b16', border: '1px solid #1a2035', borderRadius: 2,
            padding: '4px 12px', fontSize: 9, color: '#445566', zIndex: 1000,
            fontFamily: FONT, letterSpacing: 1,
          }}>
            LOADING CLOUD DATA {progress}%
          </div>
        )}

        {/* Bottom action bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#06080f', borderTop: '1px solid #1a2035',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 12px', height: 36, zIndex: 1000,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn onClick={() => setModal('submitSpot')}>+ SUBMIT SPOT</ActionBtn>
            {!adminAuthed && (
              <form onSubmit={handleAdminLogin} style={{ display: 'flex', gap: 4 }}>
                <input
                  type="password"
                  value={adminInput}
                  onChange={e => setAdminInput(e.target.value)}
                  placeholder="admin..."
                  style={{
                    background: '#0a0e18', border: '1px solid #1a2035',
                    color: '#445566', padding: '2px 8px', fontSize: 9,
                    fontFamily: FONT, width: 80, outline: 'none', borderRadius: 2,
                  }}
                />
              </form>
            )}
            {adminAuthed && (
              <ActionBtn onClick={() => setModal('admin')} highlight>
                QUEUE
              </ActionBtn>
            )}
          </div>

          <div style={{ color: '#1e2a3a', fontSize: 9, letterSpacing: 1 }}>
            NIGHT WATCH · SWL713
          </div>

          <div style={{ color: sw.last_updated ? '#334455' : '#1e2a3a', fontSize: 9 }}>
            {sw.last_updated
              ? `SW: ${new Date(sw.last_updated).toUTCString().slice(17,22)} UTC`
              : 'SW: —'}
          </div>
        </div>
      </div>

      {/* Time slider */}
      <TimeSlider value={selectedHour} onChange={setSelectedHour} />

      {/* Modals */}
      {modal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{
            position: 'fixed', inset: 0, background: '#00000088',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          {modal === 'submitSpot' && <SubmitSpot onClose={() => setModal(null)} />}
          {modal === 'submitPhoto' && selectedSpotForPhoto && (
            <SubmitPhoto
              spot={selectedSpotForPhoto}
              spaceWeather={sw}
              onClose={() => { setModal(null); setSelectedSpotForPhoto(null) }}
            />
          )}
          {modal === 'admin' && <AdminQueue onClose={() => setModal(null)} />}
        </div>
      )}
    </div>
  )
}

function ActionBtn({ onClick, children, highlight }) {
  return (
    <button onClick={onClick} style={{
      background: '#060810',
      border: `1px solid ${highlight ? '#cc8800' : '#1a2a3a'}`,
      color: highlight ? '#cc8800' : '#334455',
      padding: '3px 10px', fontSize: 9, fontFamily: FONT,
      cursor: 'pointer', letterSpacing: 1, borderRadius: 2,
    }}>
      {children}
    </button>
  )
}
