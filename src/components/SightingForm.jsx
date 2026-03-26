import { useState, useEffect } from 'react'
import { submitSighting } from '../hooks/useSpots.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const OBSERVATIONS = [
  'Naked Eye', 'Pillars', 'Diffuse', 'Low Horizon',
  'Overhead', 'Greens', 'Reds', 'Purples', 'Blues',
]

const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '6px 10px', fontSize: 11,
  fontFamily: FONT, outline: 'none', borderRadius: 2,
  width: '100%', boxSizing: 'border-box',
}

export default function SightingForm({ onClose, onSubmitted }) {
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [observations, setObservations] = useState([])
  const [locating, setLocating] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(5))
        setLon(pos.coords.longitude.toFixed(5))
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  function toggleObs(obs) {
    setObservations(prev =>
      prev.includes(obs) ? prev.filter(o => o !== obs) : [...prev, obs]
    )
  }

  async function handleSubmit() {
    const latF = parseFloat(lat), lonF = parseFloat(lon)
    if (isNaN(latF) || isNaN(lonF)) {
      setStatus({ error: 'Valid coordinates required' })
      return
    }
    setSubmitting(true)
    const { error } = await submitSighting(latF, lonF, observations)
    setSubmitting(false)
    if (error) {
      setStatus({ error: error.message || 'Submission failed' })
    } else {
      onSubmitted?.()
      onClose()
    }
  }

  if (status?.error) return (
    <div style={{ background: '#070b16', border: '1px solid #cc2222', borderRadius: 4,
      padding: 20, width: 300, fontFamily: FONT, color: '#ccd', textAlign: 'center' }}>
      <div style={{ color: '#ff5566', fontSize: 12, marginBottom: 12 }}>{status.error}</div>
      <button onClick={() => setStatus(null)} style={{ ...inputStyle, cursor: 'pointer',
        color: '#ff5566', border: '1px solid #ff556644', width: 'auto', padding: '6px 20px' }}>
        BACK
      </button>
    </div>
  )

  return (
    <div style={{ background: '#070b16', border: '1px solid #cc2222', borderRadius: 4,
      padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ color: '#ff4444', fontSize: 12, letterSpacing: 2 }}>🌌 REPORT AURORA</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Location */}
      <div style={{ color: '#334455', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>LOCATION</div>
      {locating ? (
        <div style={{ color: '#445566', fontSize: 10, marginBottom: 10 }}>📍 Getting your location...</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={lat}
            onChange={e => setLat(e.target.value)} placeholder="Latitude" />
          <input style={{ ...inputStyle, flex: 1 }} value={lon}
            onChange={e => setLon(e.target.value)} placeholder="Longitude" />
        </div>
      )}

      {/* Observations */}
      <div style={{ color: '#334455', fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
        WHAT ARE YOU SEEING?
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {OBSERVATIONS.map(obs => {
          const active = observations.includes(obs)
          return (
            <button key={obs} onClick={() => toggleObs(obs)} style={{
              padding: '4px 8px', fontSize: 9, letterSpacing: 1, borderRadius: 2,
              background: active ? '#0d2a1a' : '#060810',
              border: `1px solid ${active ? '#44ffaa' : '#1a2a3a'}`,
              color: active ? '#44ffaa' : '#445566',
              cursor: 'pointer', fontFamily: FONT,
            }}>{obs}</button>
          )
        })}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitting || locating} style={{
        width: '100%', padding: '8px 0', fontSize: 10, letterSpacing: 2,
        background: '#1a0505',
        border: `1px solid ${submitting ? '#445566' : '#cc2222'}`,
        color: submitting ? '#445566' : '#ff4444',
        cursor: submitting ? 'not-allowed' : 'pointer',
        fontFamily: FONT,
      }}>
        {submitting ? 'REPORTING...' : 'CONFIRM SIGHTING'}
      </button>

      <div style={{ color: '#223344', fontSize: 8, textAlign: 'center', marginTop: 8 }}>
        Sighting expires in 5 hours
      </div>
    </div>
  )
}
