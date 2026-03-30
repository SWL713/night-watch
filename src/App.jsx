import { useState, useCallback, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMapEvents, useMap, Rectangle, Tooltip } from 'react-leaflet'
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
import CameraLayer from './components/CameraLayer.jsx'
import ClearSkyLayer from './components/ClearSkyLayer.jsx'
import CameraPopup from './components/CameraPopup.jsx'
import CameraSettings from './components/CameraSettings.jsx'
import SightingPopup from './components/SightingPopup.jsx'
import { useSightings, usePendingSpots } from './hooks/useSpots.js'
import SubmitPhoto from './components/SubmitPhoto.jsx'
import AdminQueue from './components/AdminQueue.jsx'

import { useSpaceWeather } from './hooks/useSpaceWeather.js'
import { useSpots } from './hooks/useSpots.js'
import { useCloudCover } from './hooks/useCloudCover.js'
import { getMoonData } from './utils/moon.js'

import { MAP_BOUNDS, PASSPHRASE } from './config.js'
import { loadBortleGrid, getBortle } from './utils/bortleGrid.js'
import { fetchBortleAt } from './utils/bortleApi.js'

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

// Listens for flyto events dispatched when admin clicks 'View on App Map'
function MapFlyToHandler() {
  const map = useMap()
  useEffect(() => {
    function handler(e) {
      map.flyTo([e.detail.lat, e.detail.lon], 13, { duration: 1.2 })
    }
    window.addEventListener('nightwatch:flyto', handler)
    return () => window.removeEventListener('nightwatch:flyto', handler)
  }, [map])
  return null
}

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
  const { pending: pendingSpots, pendingPhotos, flaggedPhotos, adminDeleteSpot, adminUpdateSpot, adminDeletePhoto } = usePendingSpots()
  const pendingRemovals = (sightings || []).filter(s => s.removal_requested)
  const queueCount = (pendingSpots?.length || 0) + (pendingPhotos?.length || 0) + (flaggedPhotos?.length || 0) + pendingRemovals.length
  const [selectedSighting, setSelectedSighting] = useState(null)
  const [sightingScreen, setSightingScreen] = useState(null)
  const { getCloudAt, getAvgCloudAt, loading: cloudLoading, progress, coverage, total, phase, cloudData, cloudBounds } = useCloudCover()


  const longShot = useMemo(() => {
    if (!cloudData?.points) return false
    const keys = Object.keys(cloudData.points)
    const avgs = keys.map(k => {
      const fc = cloudData.points[k]
      if (!fc?.length) return null
      return fc.reduce((s, p) => s + (p.cloudcover ?? 0), 0) / fc.length
    }).filter(v => v !== null).sort((a, b) => a - b)
    const p20 = avgs[Math.floor(avgs.length * 0.20)]
    return p20 > 50
  }, [cloudData])

  const moonData = getMoonData()
  const [bortleGrid, setBortleGrid] = useState(null)
  useEffect(() => { loadBortleGrid().then(g => { if (g) setBortleGrid(g) }) }, [])

  // Determine active heatmap mode from layer toggles
  const [pendingPin, setPendingPin] = useState(null)
  const [pinMode, setPinMode] = useState(false) // true = user clicked "place pin" button
  const [sightingPinMode, setSightingPinMode] = useState(false)
  const [nightMode, setNightMode] = useState(false)
  const [peruMode, setPeruMode] = useState(false)
  const [cameraMode, setCameraMode] = useState(false)
  const [cameraCoords, setCameraCoords] = useState(null)
  const [showCamera, setShowCamera] = useState(false) // picking location for sighting report
  const [camBortleResolved, setCamBortleResolved] = useState(5)
  const [clearSkyMode, setClearSkyMode] = useState(false)
  // HeatmapLayer handles bortle tiles + cloud canvas only
  // ClearSkyLayer handles clear sky rendering independently
  const heatmapMode = layers.clouds && layers.bortle ? 'combined'
                    : layers.clouds && clearSkyMode ? 'clouds'
                    : layers.clouds ? 'clouds'
                    : layers.bortle || clearSkyMode ? 'bortle'
                    : null
  const [showClearSkyIntro, setShowClearSkyIntro] = useState(false)
  const [activeCam, setActiveCam] = useState(null)
  const [sightingPendingCoords, setSightingPendingCoords] = useState(null)

  function toggleLayer(key) {
    if (key === 'cameras') setActiveCam(null)
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
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

  const heatmapActive = layers.clouds || layers.bortle

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', minHeight: '-webkit-fill-available', background: '#06080f',
      fontFamily: FONT, overflow: 'hidden', outline: 'none',
      cursor: (pinMode || sightingPinMode || cameraMode) ? 'crosshair' : 'default',
      paddingTop: 'env(safe-area-inset-top, 6px)',
      filter: peruMode
        ? 'grayscale(1) sepia(1) saturate(20) hue-rotate(225deg) brightness(0.75)'
        : nightMode
        ? 'grayscale(1) sepia(1) saturate(5) hue-rotate(317deg) brightness(0.6)'
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
      <div id="map-wrapper" style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[MAP_BOUNDS.center[0], MAP_BOUNDS.center[1]]}
          zoom={MAP_BOUNDS.zoom}
          minZoom={MAP_BOUNDS.minZoom}
          maxZoom={MAP_BOUNDS.maxZoom}
          zoomSnap={0.25}
          zoomDelta={0.25}
          wheelPxPerZoomLevel={120}
          zoomControl={false}
          worldCopyJump={true}
          style={{ height: '100%', width: '100%', background: '#06080f', cursor: 'inherit' }}
        >
          {/* Dark base tile layer */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> · NOAA SWPC'
            opacity={0.8}
          />

          {!layers.bortle && <ZoomControl position="bottomright" />}



          <MapSearch
            onSelectResult={(result, isPeru) => { if (isPeru) setPeruMode(m => !m) }}
            onAddPin={(lat, lon) => {
              setPendingPin({ lat, lon })
              setModal('submitSpot')
            }}
          />
          <MapFlyToHandler />

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
                transition: 'all 0.15s', outline: 'none',
              }}
            >
              🌙
            </button>
          </div>

          {/* Camera advisor button */}
          <div style={{ position: 'absolute', top: 100, left: 12, zIndex: 1000 }}>
            <button
              onClick={() => { setCameraMode(m => !m); setShowCamera(false) }}
              title="Camera settings advisor"
              style={{
                width: 36, height: 36,
                background: cameraMode ? '#001a0d' : '#070b16',
                border: `1px solid ${cameraMode ? '#44ddaa' : '#1a2a3a'}`,
                borderRadius: 2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: cameraMode ? '#44ddaa' : '#445566',
                transition: 'all 0.15s', outline: 'none',
              }}
            >
              📷
            </button>
          </div>

          {/* Clear sky finder button */}
          <div style={{ position: 'absolute', top: 144, left: 12, zIndex: 1000 }}>
            <button
              onClick={() => {
                setClearSkyMode(m => {
                  if (!m) {
                    setLayers(prev => ({ ...prev, clouds: false, bortle: false }))
                    if (!sessionStorage.getItem('nw_clearsky_seen')) {
                      setShowClearSkyIntro(true)
                    }
                  }
                  return !m
                })
              }}
              title="Clear sky finder"
              style={{
                width: 36, height: 36,
                background: clearSkyMode ? '#001a15' : '#070b16',
                border: `1px solid ${clearSkyMode ? '#44ddaa' : '#1a2a3a'}`,
                borderRadius: 2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: clearSkyMode ? '#44ddaa' : '#445566',
                transition: 'all 0.15s', outline: 'none',
              }}
            >☁️</button>
          </div>

          {/* Map click handler — only active in pin placement mode */}
          <MapClickHandler
            active={pinMode || sightingPinMode || cameraMode}
            onMapClick={(lat, lon) => {
              if (cameraMode) {
                setCameraCoords({ lat, lon })
                setCameraMode(false)
                setShowCamera(true)
                // LPM API first (matches visual map), grid as fallback
                fetchBortleAt(lat, lon).then(b => {
                  if (b && b !== 5) { setCamBortleResolved(b); return }
                  const raw = bortleGrid ? getBortle(bortleGrid, lat, lon) : null
                  if (raw && raw !== 5) { setCamBortleResolved(Math.round(raw)); return }
                  setCamBortleResolved(lat > 65 ? 1 : lat > 58 ? 2 : lat > 52 ? 2 : 5)
                })
              } else if (sightingPinMode) {
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
              cloudData={cloudData}
              spaceWeather={sw}
              onSubmitPhoto={handleSubmitPhoto}
              mode={heatmapMode}
              bortleGrid={bortleGrid}
              clearSkyMode={clearSkyMode}
              adminAuthed={adminAuthed}
              onAdminUpdate={adminUpdateSpot}
              onAdminDeleteSpot={adminDeleteSpot}
              onAdminDeletePhoto={adminDeletePhoto}
            />
          )}

          {clearSkyMode && cloudData && (
            <ClearSkyLayer cloudData={cloudData} getAvgCloudAt={getAvgCloudAt} />
          )}

          {/* Camera markers */}
          {layers.cameras && (
            <CameraLayer
              onCameraClick={cam => setActiveCam(cam)}
              activeId={activeCam?.id}
            />
          )}

          {/* Sighting rings */}
          {layers.sightings && (
            <SightingLayer
              sightings={sightings}
              onSightingClick={(s, screenPt) => { setSelectedSighting(s); setSightingScreen(screenPt) }}
            />
          )}

          {/* Cloud model boundary box */}
          {cloudBounds && (layers.clouds || clearSkyMode) && (() => {
            const { minLat, maxLat, minLon, maxLon } = cloudBounds
            const color = clearSkyMode ? '#44ddaa' : '#cc2244'
            const label = clearSkyMode ? 'CLEAR SKY MODEL BOUNDARY' : 'CURRENT CLOUD MODEL BOUNDARY'
            return (
              <Rectangle
                bounds={[[minLat, minLon], [maxLat, maxLon]]}
                pathOptions={{
                  color,
                  weight: 1.5,
                  opacity: 0.6,
                  fill: false,
                  dashArray: '6 5',
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  position={[(maxLat), (minLon + maxLon) / 2]}
                  offset={[0, -4]}
                  className="cloud-boundary-label"
                >
                  <span style={{
                    color,
                    fontSize: 7,
                    fontFamily: 'DejaVu Sans Mono, Consolas, monospace',
                    letterSpacing: 1,
                    background: 'rgba(6,8,15,0.75)',
                    padding: '1px 4px',
                    borderRadius: 2,
                    whiteSpace: 'nowrap',
                  }}>{label}</span>
                </Tooltip>
              </Rectangle>
            )
          })()}

        </MapContainer>

        {/* Bortle key — always shows when sky brightness on */}
        {layers.bortle && (
          <div style={{
            position: 'absolute',
            top: 150, right: 12,
            zIndex: 1000,
            background: 'rgba(6,8,15,0.85)',
            border: '1px solid #1a2a3a',
            borderRadius: 4,
            padding: '6px 6px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: '#6688aa', fontSize: 6, fontFamily: FONT, letterSpacing: 0.5, lineHeight: 1.2 }}>BORTLE</span>
              <span style={{ color: '#6688aa', fontSize: 6, fontFamily: FONT, letterSpacing: 0.5, lineHeight: 1.2 }}>EQUIV.</span>
            </div>
            {[
              { color: 'rgba(255,235,0,0.15)', label: '1-2' },
              { color: 'rgba(255,225,0,0.28)', label: '3' },
              { color: 'rgba(255,215,0,0.42)', label: '4' },
              { color: 'rgba(255,200,0,0.55)', label: '5' },
              { color: 'rgba(255,160,0,0.68)', label: '6' },
              { color: 'rgba(255,70,0,0.80)',  label: '7' },
              { color: 'rgba(255,10,0,0.88)',  label: '8' },
              { color: 'rgba(255,0,40,0.95)',  label: '9' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <div style={{ width: 22, height: 16, borderRadius: 2, background: color, border: '1px solid rgba(255,255,255,0.12)' }} />
                <span style={{ color: '#aabbcc', fontSize: 6, fontFamily: FONT }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Clear sky key — always shows BEST/GOOD/FAIR, adds LONG SHOT below when active */}
        {clearSkyMode && (
          <div style={{
            position: 'absolute',
            top: 150, right: layers.bortle ? 50 : 12,
            zIndex: 1000,
            background: 'rgba(6,8,15,0.85)',
            border: `1px solid ${longShot ? '#ff8c00' : '#1a2a3a'}`,
            borderRadius: 4,
            padding: '6px 6px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: '#44ddaa', fontSize: 6, fontFamily: FONT, letterSpacing: 0.5, lineHeight: 1.2 }}>CLEAR</span>
              <span style={{ color: '#44ddaa', fontSize: 6, fontFamily: FONT, letterSpacing: 0.5, lineHeight: 1.2 }}>SKY</span>
            </div>
            {[
              { alpha: 0.60, label: 'BEST' },
              { alpha: 0.37, label: 'GOOD' },
              { alpha: 0.18, label: 'FAIR' },
            ].map(({ alpha, label }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <div style={{ width: 22, height: 16, borderRadius: 2, background: `rgba(0,210,160,${alpha})`, border: '1px solid rgba(255,255,255,0.12)' }} />
                <span style={{ color: '#aabbcc', fontSize: 6, fontFamily: FONT }}>{label}</span>
              </div>
            ))}
            {longShot && (
              <>
                <div style={{ width: 22, height: 1, background: 'rgba(255,140,0,0.3)', margin: '1px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <div style={{ width: 22, height: 16, borderRadius: 2, background: 'rgba(150,210,120,0.18)', border: '1.5px dashed rgba(255,140,0,0.85)' }} />
                  <span style={{ color: '#ff8c00', fontSize: 6, fontFamily: FONT }}>LONG</span>
                  <span style={{ color: '#ff8c00', fontSize: 6, fontFamily: FONT }}>SHOT</span>
                </div>
              </>
            )}
          </div>
        )}

        {clearSkyMode && (
          <div style={{
            position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, textAlign: 'center',
            fontFamily: FONT, whiteSpace: 'nowrap',
          }}>
            <div style={{
              background: 'rgba(7,11,22,0.92)', border: '1px solid #44ddaa',
              borderRadius: 3, padding: '4px 14px',
              color: '#44ddaa', fontSize: 10, letterSpacing: 1.5,
              boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
            }}>
              CLEAR SKY FINDER MODE
            </div>
            <div style={{
              color: '#2a6655', fontSize: 8, letterSpacing: 0.8,
              marginTop: 3,
            }}>
              TEAL = BEST OPTIONS · 8-HOUR AVERAGE
            </div>
            {longShot && (
              <div style={{ color: '#ff8c00', fontSize: 8, fontFamily: FONT, letterSpacing: 1, marginTop: 2 }}>
                ⚠️ LONG SHOT · HEAVILY CLOUDED REGION
              </div>
            )}
          </div>
        )}

        {/* Clear sky finder intro modal */}
        {showClearSkyIntro && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
            onClick={() => { setShowClearSkyIntro(false); sessionStorage.setItem('nw_clearsky_seen', '1') }}
          >
            <div onClick={e => e.stopPropagation()} style={{
              background: '#07090f', border: '1px solid #44ddaa',
              borderRadius: 6, padding: '20px 22px', maxWidth: 340,
              fontFamily: FONT, boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
            }}>
              <div style={{ color: '#44ddaa', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>
                ☁️ CLEAR SKY FINDER
              </div>
              <div style={{ color: '#aabbcc', fontSize: 11, lineHeight: 1.7, marginBottom: 14 }}>
                Shows the clearest areas averaged across the <span style={{ color: '#44ddaa' }}>next 8 hours</span> — not just right now.
              </div>
              <div style={{ color: '#778899', fontSize: 10, lineHeight: 1.7, marginBottom: 18 }}>
                <span style={{ color: '#44ddaa' }}>Green = clearest skies.</span> Fading = partly clear. No green = cloud covered.
              </div>

              <button
                onClick={() => { setShowClearSkyIntro(false); sessionStorage.setItem('nw_clearsky_seen', '1') }}
                style={{
                  width: '100%', padding: '8px 0', fontSize: 10, letterSpacing: 2,
                  background: '#0d2a1a', border: '1px solid #44ddaa',
                  color: '#44ddaa', cursor: 'pointer', fontFamily: FONT, borderRadius: 3,
                }}
              >
                GOT IT
              </button>
            </div>
          </div>
        )}

        {/* Live cam popup */}
        {activeCam && (
          <CameraPopup
            camera={activeCam}
            onClose={() => setActiveCam(null)}
          />
        )}

        {/* Camera advisor panel */}
        {showCamera && cameraCoords && (() => {
          return (
            <CameraSettings
              onClose={() => { setShowCamera(false); setCameraCoords(null); setCamBortleResolved(5) }}
              locationData={{
                lat: cameraCoords.lat,
                lon: cameraCoords.lon,
                bortle: camBortleResolved,
                moonIllum: Math.round((moonData?.illumination || 0) * 100),
                moonUp: (moonData?.illumination || 0) > 0,
                mlat: null,
              }}
              spaceWeather={{ intensity: sw?.intensity || 'Weak' }}
            />
          )
        })()}

        {/* Sighting popup — outside MapContainer so it's a plain div */}
        {selectedSighting && sightingScreen && (
          <SightingPopup
            sighting={selectedSighting}
            screenPos={sightingScreen}
            adminAuthed={adminAuthed}
            onDelete={deleteSighting}
            onRefresh={reloadSightings}
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

        {/* Camera mode hint */}
        {cameraMode && (
          <div style={{
            position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(7,11,22,0.92)', border: '1px solid #44ddaa',
            borderRadius: 3, padding: '6px 14px', zIndex: 1100,
            color: '#44ddaa', fontSize: 10, fontFamily: FONT,
            letterSpacing: 1, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
          }}>
            📷 TAP YOUR SHOOTING LOCATION ON THE MAP
          </div>
        )}

        {/* NASA attribution — bottom right overlay */}
        <div style={{
          position: 'absolute', bottom: 58, right: 48,
          color: 'rgba(40,70,100,0.55)', fontSize: 8, letterSpacing: 0.5,
          fontFamily: FONT, zIndex: 900, pointerEvents: 'none',
        }}>
          sky brightness: <a href="https://djlorenz.github.io/astronomy/lp" target="_blank" rel="noopener"
            style={{ color: 'rgba(40,80,120,0.55)', textDecoration: 'none' }}>© David Lorenz</a>
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
          padding: '0 0', height: 52, zIndex: 2000, overflow: 'visible',
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
            gap: 8, padding: '0 10px', overflow: 'visible' }}>
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
              <div style={{ position: 'relative', overflow: 'visible' }}>
                {queueCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -8, right: -8, zIndex: 9999,
                    background: '#cc4400', borderRadius: '50%',
                    width: 16, height: 16, fontSize: 8, fontFamily: FONT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 'bold', pointerEvents: 'none',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  }}>{queueCount > 9 ? '9+' : queueCount}</div>
                )}
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
              </div>
            )}
            {adminAuthed && (
              <div style={{ position: 'relative', overflow: 'visible' }}>
                {queueCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -8, right: -8, zIndex: 9999,
                    background: '#cc4400', borderRadius: '50%',
                    width: 16, height: 16, fontSize: 8, fontFamily: FONT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 'bold', pointerEvents: 'none',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  }}>{queueCount > 9 ? '9+' : queueCount}</div>
                )}
                <ActionBtn onClick={() => setModal('admin')} highlight>QUEUE</ActionBtn>
              </div>
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
          {modal === 'admin' && (
            <AdminQueue
              onClose={() => setModal(null)}
              onViewOnMap={(lat, lon) => {
                setModal(null)
                // Use a custom event to fly the map — MapFlyTo component listens for it
                window.__nightWatchFlyTo = { lat, lon }
                window.dispatchEvent(new CustomEvent('nightwatch:flyto', { detail: { lat, lon } }))
              }}
            />
          )}
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
