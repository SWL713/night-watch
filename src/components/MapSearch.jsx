import { useState, useRef, useEffect } from 'react'
import { useMap, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

// Teal crosshair pin for GPS search results
const searchIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:20px;height:20px;border-radius:50%;
    background:#44ddaa;border:2px solid #07090f;
    box-shadow:0 0 0 2px #44ddaa66,0 0 12px #44ddaa88;
    position:relative;
  ">
    <div style="position:absolute;top:50%;left:-8px;width:6px;height:1px;background:#44ddaa;transform:translateY(-50%)"></div>
    <div style="position:absolute;top:50%;right:-8px;width:6px;height:1px;background:#44ddaa;transform:translateY(-50%)"></div>
    <div style="position:absolute;left:50%;top:-8px;height:6px;width:1px;background:#44ddaa;transform:translateX(-50%)"></div>
    <div style="position:absolute;left:50%;bottom:-8px;height:6px;width:1px;background:#44ddaa;transform:translateX(-50%)"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

// Parse "lat, lon" or "lat lon" from query string
function parseCoords(q) {
  const m = q.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/)
  if (!m) return null
  const lat = parseFloat(m[1]), lon = parseFloat(m[2])
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

export default function MapSearch({ onSelectResult, onAddPin, helpMode, onHelpTap }) {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchPin, setSearchPin] = useState(null) // { lat, lon, label }
  const inputRef = useRef()
  const debounceRef = useRef()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
    setError(null)
  }

  function clearPin() { setSearchPin(null) }

  async function search(q) {
    if (!q.trim()) { setResults([]); return }

    // GPS coordinate shortcut
    const coords = parseCoords(q)
    if (coords) {
      setResults([])
      setError(null)
      setLoading(false)
      map.flyTo([coords.lat, coords.lon], 12, { duration: 1.2 })
      setSearchPin({ lat: coords.lat, lon: coords.lon, label: `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` })
      close()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=us,ca`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      setResults(data)
      if (!data.length) setError('No results found')
    } catch {
      setError('Search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  function isPeru(result) {
    const name = result.display_name?.toLowerCase() || ''
    return name.includes('peru') && (name.includes('clinton') || name.includes('new york') || name.includes(', ny') || name.includes('essex'))
  }

  function flyTo(result) {
    map.flyTo([parseFloat(result.lat), parseFloat(result.lon)], 11, { duration: 1.2 })
    if (onSelectResult) onSelectResult(result, isPeru(result))
    close()
  }

  return (
    <>
      {/* Temporary GPS pin */}
      {searchPin && (
        <Marker position={[searchPin.lat, searchPin.lon]} icon={searchIcon}>
          <Popup>
            <div style={{ fontFamily: FONT, background: '#07090f', padding: '10px 12px', minWidth: 180 }}>
              <div style={{ color: '#44ddaa', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                📍 {searchPin.label}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { onAddPin && onAddPin(searchPin.lat, searchPin.lon); clearPin() }}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
                    background: '#0d1a2a', border: '1px solid #44ddaa',
                    color: '#44ddaa', cursor: 'pointer', fontFamily: FONT, borderRadius: 2,
                  }}
                >
                  + ADD LOCATION
                </button>
                <button
                  onClick={clearPin}
                  style={{
                    padding: '6px 10px', fontSize: 9,
                    background: '#070b16', border: '1px solid #1a2a3a',
                    color: '#445566', cursor: 'pointer', fontFamily: FONT, borderRadius: 2,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2000 }}>
        {!open ? (
          <button
            onClick={() => helpMode ? onHelpTap?.('map_search') : setOpen(true)}
            title="Search location"
            style={{
              width: 36, height: 36,
              background: '#070b16', border: '1px solid #1a2a3a',
              borderRadius: 2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#445566',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#44ddaa'; e.currentTarget.style.color = '#44ddaa' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2a3a'; e.currentTarget.style.color = '#445566' }}
          >
            🔍
          </button>
        ) : (
          <div style={{
            background: '#070b16', border: '1px solid #1a2a3a',
            borderRadius: 2, width: 260, fontFamily: FONT,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 6 }}>
              <span style={{ color: '#445566', fontSize: 14, flexShrink: 0 }}>🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={handleInput}
                placeholder="Search or paste coordinates..."
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#ccd', fontSize: 11, fontFamily: FONT,
                }}
              />
              <button onClick={close} style={{
                background: 'none', border: 'none', color: '#445566',
                fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0,
              }}>✕</button>
            </div>

            {(loading || results.length > 0 || error) && <div style={{ borderTop: '1px solid #1a2035' }} />}

            {loading && <div style={{ color: '#445566', fontSize: 9, padding: '8px 12px', letterSpacing: 1 }}>SEARCHING...</div>}
            {!loading && error && <div style={{ color: '#445566', fontSize: 10, padding: '8px 12px' }}>{error}</div>}

            {!loading && results.map((r, i) => (
              <button key={i} onClick={() => flyTo(r)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #0d1525' : 'none',
                padding: '8px 12px', cursor: 'pointer', fontFamily: FONT,
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#0d1a2a'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ color: '#aabbcc', fontSize: 11 }}>{r.display_name.split(',')[0]}</div>
                <div style={{ color: '#334455', fontSize: 9, marginTop: 2 }}>{r.display_name.split(',').slice(1, 3).join(',').trim()}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
