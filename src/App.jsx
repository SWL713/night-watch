import { useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import Auth from './components/Auth.jsx'
import TimelinePanel from './components/TimelinePanel.jsx'
import TimeSlider from './components/TimeSlider.jsx'
import Badges from './components/Badges.jsx'
import LayerControls, { initLayers } from './components/LayerControls.jsx'
import HeatmapLayer from './components/HeatmapLayer.jsx'
import OvationLines from './components/OvationLines.jsx'
import SpotPins from './components/SpotPins.jsx'
import SubmitSpot from './components/SubmitSpot.jsx'
import MapSearch from './components/MapSearch.jsx'
import SightingLayer from './components/SightingLayer.jsx'
import SightingForm from './components/SightingForm.jsx'
import SightingPopup from './components/SightingPopup.jsx'
import { useSightings } from './hooks/useSpots.js'
import SubmitPhoto from './components/SubmitPhoto.jsx'
import AdminQueue from './components/AdminQueue.jsx'

import { useSpaceWeather } from './hooks/useSpaceWeather.js'
import { useSpots } from './hooks/useSpots.js'
import { useCloudCover } from './hooks/useCloudCover.js'
import { getMoonData } from './utils/moon.js'

import { MAP_BOUNDS, PASSPHRASE } from './config.js'
import { loadBortleGrid } from './utils/bortleGrid.js'

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
  const [authed, setAuthed] = useState(() => {
    // Check localStorage immediately on first render
    return localStorage.getItem('nw_auth') === PASSPHRASE
  })

  if (!authed) return <Auth onAuth={() => setAuthed(true)} />
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
  const { sightings, deleteSighting, reload: reloadSightings } = useSightings()
  const [selectedSighting, setSelectedSighting] = useState(null)
  const [sightingScreen, setSightingScreen] = useState(null)
  const { getCloudAt, loading: cloudLoading, progress, coverage, total, phase, cloudData } = useCloudCover()

  const moonData = getMoonData()
  const [bortleGrid, setBortleGrid] = useState(null)
  useEffect(() => { loadBortleGrid().then(g => { if (g) setBortleGrid(g) }) }, [])

  // Determine active heatmap mode from layer toggles
  const heatmapMode = layers.clouds ? 'clouds' : layers.bortle ? 'bortle' : 'combined'
  const [pendingPin, setPendingPin] = useState(null)
  const [pinMode, setPinMode] = useState(false) // true = user clicked "place pin" button
  const [sightingPinMode, setSightingPinMode] = useState(false)
  const [nightMode, setNightMode] = useState(false)
  const [peruMode, setPeruMode] = useState(false) // picking location for sighting report
  const [sightingPendingCoords, setSightingPendingCoords] = useState(null)

  function toggleLayer(key) {
    setLayers(prev => {
      const next = { ...prev }
      if (['heatmap', 'clouds', 'bortle'].includes(key)) {
        // Heatmap modes are mutually exclusive — turn off others when one is selected
        next.heatmap = false
        next.clouds  = false
        next.bortle  = false
        next[key]    = !prev[key]
      } else {
        next[key] = !prev[key]
      }
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
      paddingTop: 'env(safe-area-inset-top, 6px)',
      filter: peruMode
        ? 'grayscale(1) sepia(1) saturate(20) hue-rotate(240deg) brightness(0.75)'
        : nightMode
        ? 'brightness(0.4) saturate(0.2) sepia(0.9)'
        : 'none',
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
          style={{ height: '100%', width: '100%', background: '#06080f', cursor: (pinMode || sightingPinMode) ? 'crosshair' : 'grab' }}
        >
          {/* Dark base tile layer */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> · NOAA SWPC · Open-Meteo'
            opacity={0.8}
          />

          <ZoomControl position="bottomright" />

          <MapSearch onSelectResult={(result, isPeru) => { if (isPeru) setPeruMode(m => !m) }} />

          {/* Night mode toggle */}
          <div style={{ position: 'absolute', top: 56, left: 12, zIndex: 1000 }}>
            <button
              onClick={() => { setNightMode(m => !m); setPeruMode(false) }}
              title="Night vision mode"
              style={{
                width: 36, height: 36,
                background: nightMode ? '#1a0000' : '#070b16',
                border: `1px solid ${peruMode ? '#ff44cc' : nightMode ? '#ff4400' : '#1a2a3a'}`,
                borderRadius: 2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: peruMode ? '#ff44cc' : nightMode ? '#ff4400' : '#445566',
                transition: 'all 0.15s',
              }}
            >
              🌙
            </button>
          </div>

          {/* Map click handler — only active in pin placement mode */}
          <MapClickHandler
            active={pinMode || sightingPinMode}
            onMapClick={(lat, lon) => {
              if (sightingPinMode) {
                setSightingPendingCoords({ lat, lon })
                setSightingPinMode(false)
                setModal('reportAurora')
              } else {
                setPendingPin({ lat, lon })
                setPinMode(false)
                setModal('submitSpot')
              }
            }}
          />

          {/* Heatmap */}
          {heatmapActive && (
            <HeatmapLayer
              mode={heatmapMode}
              selectedHour={selectedHour}
              getCloudAt={getCloudAt}
              cloudLoading={cloudLoading}
              cloudData={cloudData}
            />
          )}

          {/* Ovation lines */}
          {layers.ovation && <OvationLines spaceWeather={sw} selectedHour={selectedHour} />}

          {/* Spot pins */}
          {layers.pins && (
            <SpotPins
              spots={spots}
              selectedHour={selectedHour}
              getCloudAt={getCloudAt}
              spaceWeather={sw}
              onSubmitPhoto={handleSubmitPhoto}
              mode={heatmapMode}
              bortleGrid={bortleGrid}
            />
          )}

          {/* Sighting rings */}
          {layers.sightings && (
            <SightingLayer
              sightings={sightings}
              onSightingClick={(s, screenPt) => { setSelectedSighting(s); setSightingScreen(screenPt) }}
            />
          )}

        </MapContainer>

        {/* Sighting popup — outside MapContainer so it's a plain div */}
        {selectedSighting && sightingScreen && (
          <SightingPopup
            sighting={selectedSighting}
            screenPos={sightingScreen}
            adminAuthed={adminAuthed}
            onDelete={deleteSighting}
            onClose={() => { setSelectedSighting(null); setSightingScreen(null) }}
          />
        )}

        {/* Badges top-right */}
        <Badges spaceWeather={sw} selectedHour={selectedHour} />

        {/* Night Watch title — top center overlay */}
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(100,140,180,0.35)', fontSize: 10, letterSpacing: 3,
          fontFamily: FONT, zIndex: 900, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          NIGHT WATCH · SWL713
        </div>

        {/* NASA attribution — bottom right overlay */}
        <div style={{
          position: 'absolute', bottom: 76, right: 48,
          color: 'rgba(40,70,100,0.55)', fontSize: 8, letterSpacing: 0.5,
          fontFamily: FONT, zIndex: 900, pointerEvents: 'none',
        }}>
          light pollution: <a href="https://earthdata.nasa.gov" target="_blank" rel="noopener"
            style={{ color: 'rgba(40,80,120,0.55)', textDecoration: 'none' }}>NASA GIBS</a>
        </div>

        {/* Layer controls bottom-left */}
        <LayerControls
          layers={layers}
          onToggle={toggleLayer}
        />

        {/* Cloud loading indicator */}
        {(cloudLoading || phase === 'fallback') && (
          <div style={{
            position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)',
            background: '#070b16', border: '1px solid #1a2035', borderRadius: 2,
            padding: '4px 12px', fontSize: 9, zIndex: 1000,
            fontFamily: FONT, letterSpacing: 1,
            color: phase === 'fallback' ? '#cc8800' : '#445566',
          }}>
            {phase === 'loading'  && `CLOUD DATA LOADING...`}
            {phase === 'fallback' && `PIPELINE UNAVAILABLE — FETCHING DIRECT ${progress}%`}
          </div>
        )}

        {/* Bottom action bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#06080f', borderTop: '1px solid #1a2035',
          display: 'flex', alignItems: 'center',
          padding: '0 0', height: 52, zIndex: 1000,
        }}>
          {/* Action buttons — span same width as layer controls (110px total) */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'stretch',
            paddingLeft: 10, height: '100%', paddingTop: 4, paddingBottom: 4 }}>
            {/* Report Aurora */}
            <button
              onClick={() => { setSightingPinMode(false); setSightingPendingCoords(null); setModal('reportAurora') }}
              style={{
                width: 53, flexShrink: 0, padding: 0,
                background: sightingPinMode ? '#1a0a00' : '#1a0505',
                border: `1px solid ${sightingPinMode ? '#ff8800' : '#cc2222'}`,
                color: sightingPinMode ? '#ff8800' : '#ff4444',
                fontSize: 8, fontFamily: FONT, letterSpacing: 1,
                cursor: 'pointer', borderRadius: 2, lineHeight: 1.4,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 1,
              }}
            >
              <span style={{ fontSize: 13 }}>🌌</span>
              <span>{sightingPinMode ? <>CLICK<br/>MAP</> : <>REPORT<br/>AURORA</>}</span>
            </button>

            {/* Place pin */}
            <button
              onClick={() => { setPinMode(m => !m); setPendingPin(null) }}
              style={{
                width: 53, flexShrink: 0, padding: 0,
                background: pinMode ? '#0d2a1a' : '#071a2a',
                border: `1px solid ${pinMode ? '#44ffcc' : '#00aacc'}`,
                color: pinMode ? '#44ffcc' : '#00ccee',
                fontSize: 8, fontFamily: FONT, letterSpacing: 1,
                cursor: 'pointer', borderRadius: 2, lineHeight: 1.4,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 1,
              }}
            >
              <span style={{ fontSize: 13 }}>📍</span>
              <span>{pinMode ? <>CLICK<br/>MAP</> : <>+ PLACE<br/>PIN</>}</span>
            </button>
          </div>

          {/* Rest of bar */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center',
            gap: 8, padding: '0 10px', overflow: 'hidden' }}>
            {/* Pending pin coords */}
            {pendingPin && !pinMode && (
              <>
                <span style={{ color: '#44ddaa', fontSize: 9, fontFamily: FONT }}>
                  {pendingPin.lat.toFixed(4)}, {pendingPin.lon.toFixed(4)}
                </span>
                <ActionBtn highlight onClick={() => setModal('submitSpot')}>SUBMIT</ActionBtn>
                <button onClick={() => setPendingPin(null)} style={{
                  background: 'none', border: 'none', color: '#445566',
                  fontSize: 12, cursor: 'pointer', padding: '0 2px',
                }}>✕</button>
              </>
            )}

            {/* Admin — input + GO stacked vertically to save lateral space */}
            {!adminAuthed && (
              <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                <button type="submit" style={{
                  background: '#060810', border: '1px solid #1a2035',
                  color: '#334455', padding: '2px 0', fontSize: 9, width: 80,
                  fontFamily: FONT, cursor: 'pointer', borderRadius: 2, textAlign: 'center',
                }}>GO</button>
              </form>
            )}
            {adminAuthed && (
              <ActionBtn onClick={() => setModal('admin')} highlight>QUEUE</ActionBtn>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 10 }}>
            <div style={{ color: '#2a3f55', fontSize: 8, letterSpacing: 0.5, fontFamily: FONT }}>
              SWL713
            </div>
            <div style={{ color: sw.last_updated ? '#334455' : '#1e2a3a', fontSize: 9 }}>
              {sw.last_updated
                ? `SW: ${new Date(sw.last_updated).toUTCString().slice(17,22)} UTC`
                : 'SW: —'}
            </div>
            {(() => {
              const cu = cloudData?.lastUpdated
              if (!cu) return null
              const ageMin = Math.round((Date.now() - new Date(cu)) / 60000)
              const color = ageMin > 180 ? '#ff5544' : ageMin > 90 ? '#ffaa33' : '#334455'
              return <div style={{ color, fontSize: 9 }}>{`CL: ${new Date(cu).toUTCString().slice(17,22)} UTC`}</div>
            })()}
          </div>
        </div>
      </div>

      {/* Developer attribution — between action bar and time slider */}
      <div style={{
        background: '#06080f', borderTop: '1px solid #0d1525',
        padding: '2px 12px',
        color: '#1e2e40', fontSize: 8, letterSpacing: 0.5, fontFamily: FONT,
        flexShrink: 0,
      }}>
        Developed by Scott W. LeFevre — 2026
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
          {modal === 'submitSpot' && (
            <SubmitSpot
              initialCoords={pendingPin}
              onClose={() => { setModal(null); setPendingPin(null); setPinMode(false) }}
            />
          )}
          {modal === 'submitPhoto' && selectedSpotForPhoto && (
            <SubmitPhoto
              spot={selectedSpotForPhoto}
              onClose={() => { setModal(null); setSelectedSpotForPhoto(null) }}
            />
          )}
          {modal === 'admin' && <AdminQueue onClose={() => setModal(null)} />}
          {modal === 'reportAurora' && (
            <SightingForm
              overrideCoords={sightingPendingCoords}
              onClose={() => { setModal(null); setSightingPendingCoords(null) }}
              onSubmitted={() => { setModal(null); setSightingPendingCoords(null); reloadSightings() }}
              onPickLocation={() => { setModal(null); setSightingPinMode(true) }}
            />
          )}
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

// Listens for map clicks and returns lat/lon
function MapClickHandler({ active, onMapClick }) {
  useMapEvents({
    click(e) {
      if (!active) return  // only fire when pin mode is active
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}
