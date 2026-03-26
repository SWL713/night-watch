import { useState, useRef, useEffect } from 'react'
import { useMap } from 'react-leaflet'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function MapSearch() {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()
  const debounceRef = useRef()

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
    setError(null)
  }

  async function search(q) {
    if (!q.trim()) { setResults([]); return }
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

  function flyTo(result) {
    map.flyTo([parseFloat(result.lat), parseFloat(result.lon)], 11, { duration: 1.2 })
    close()
  }

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 1000,
    }}>
      {!open ? (
        // Magnifying glass button
        <button
          onClick={() => setOpen(true)}
          title="Search location"
          style={{
            width: 36, height: 36,
            background: '#070b16', border: '1px solid #1a2a3a',
            borderRadius: 2, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: '#445566',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#44ddaa'; e.currentTarget.style.color = '#44ddaa' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2a3a'; e.currentTarget.style.color = '#445566' }}
        >
          🔍
        </button>
      ) : (
        // Search panel
        <div style={{
          background: '#070b16', border: '1px solid #1a2a3a',
          borderRadius: 2, width: 260, fontFamily: FONT,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>
          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 6 }}>
            <span style={{ color: '#445566', fontSize: 14, flexShrink: 0 }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={handleInput}
              placeholder="Search location..."
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#ccd', fontSize: 11, fontFamily: FONT,
              }}
            />
            <button
              onClick={close}
              style={{
                background: 'none', border: 'none', color: '#445566',
                fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0,
              }}
            >✕</button>
          </div>

          {/* Divider */}
          {(loading || results.length > 0 || error) && (
            <div style={{ borderTop: '1px solid #1a2035' }} />
          )}

          {/* Loading */}
          {loading && (
            <div style={{ color: '#445566', fontSize: 9, padding: '8px 12px', letterSpacing: 1 }}>
              SEARCHING...
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ color: '#445566', fontSize: 10, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Results */}
          {!loading && results.map((r, i) => (
            <button
              key={i}
              onClick={() => flyTo(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #0d1525' : 'none',
                padding: '8px 12px', cursor: 'pointer', fontFamily: FONT,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#0d1a2a'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{ color: '#aabbcc', fontSize: 11 }}>
                {r.display_name.split(',')[0]}
              </div>
              <div style={{ color: '#334455', fontSize: 9, marginTop: 2 }}>
                {r.display_name.split(',').slice(1, 3).join(',').trim()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
