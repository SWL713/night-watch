import { useState } from 'react'
import { submitSpot } from '../hooks/useSpots.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '8px 10px', fontSize: 12,
  fontFamily: FONT, outline: 'none', borderRadius: 2, width: '100%',
  boxSizing: 'border-box',
}

export default function SubmitSpot({ onClose, initialCoords }) {
  const [form, setForm] = useState({
    name: '',
    lat: initialCoords ? initialCoords.lat.toFixed(6) : '',
    lon: initialCoords ? initialCoords.lon.toFixed(6) : '',
    bortle: '4',
    view_direction: 'N',
    access_notes: '',
    horizon_rating: '3',
  })
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const lat = parseFloat(form.lat), lon = parseFloat(form.lon)
    if (isNaN(lat) || isNaN(lon)) {
      setStatus({ error: 'Invalid coordinates' })
      setSubmitting(false)
      return
    }
    const { error } = await submitSpot({
      name: form.name, lat, lon,
      bortle: parseInt(form.bortle),
      view_direction: form.view_direction,
      access_notes: form.access_notes,
      horizon_rating: parseInt(form.horizon_rating),
      photos: [],
    })
    setSubmitting(false)
    if (error) setStatus({ error: error.message || error })
    else setStatus({ success: true })
  }

  if (status?.success) return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 24, fontFamily: FONT, color: '#ccd', width: 300, textAlign: 'center' }}>
      <div style={{ color: '#44ddaa', fontSize: 14, marginBottom: 8 }}>✓ Submitted</div>
      <div style={{ color: '#445566', fontSize: 11, marginBottom: 16 }}>
        Your spot is pending review and will appear on the map once approved.
      </div>
      <button onClick={onClose} style={{ ...inputStyle, cursor: 'pointer', color: '#44ddaa',
        border: '1px solid #44ddaa44', width: 'auto', padding: '6px 20px' }}>
        CLOSE
      </button>
    </div>
  )

  return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: '#44ddaa', fontSize: 13, letterSpacing: 2 }}>SUBMIT A SPOT</div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#445566',
          fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>
      {initialCoords ? (
        <div style={{ color: '#44ddaa', fontSize: 10, marginBottom: 10 }}>
          📍 Pinned from map: {initialCoords.lat.toFixed(4)}, {initialCoords.lon.toFixed(4)}
        </div>
      ) : (
        <div style={{ color: '#334455', fontSize: 10, marginBottom: 10 }}>
          Tip: close this and click the map to pin exact coordinates first.
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>NAME *</label>
        <input required style={inputStyle} value={form.name}
          onChange={e => set('name', e.target.value)} placeholder="e.g. Schroon Lake Boat Launch" />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>LATITUDE *</label>
            <input required style={inputStyle} value={form.lat}
              onChange={e => set('lat', e.target.value)} placeholder="43.1234" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>LONGITUDE *</label>
            <input required style={inputStyle} value={form.lon}
              onChange={e => set('lon', e.target.value)} placeholder="-73.5678" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>BORTLE</label>
            <select style={inputStyle} value={form.bortle} onChange={e => set('bortle', e.target.value)}>
              {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>VIEW DIR</label>
            <input style={inputStyle} value={form.view_direction}
              onChange={e => set('view_direction', e.target.value)} placeholder="N, NW, 360..." />
          </div>
        </div>

        <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>HORIZON QUALITY (1-5)</label>
        <input type="range" min="1" max="5" value={form.horizon_rating}
          onChange={e => set('horizon_rating', e.target.value)}
          style={{ accentColor: '#44ddaa' }} />
        <div style={{ color: '#44ddaa', fontSize: 10, textAlign: 'center' }}>
          {'★'.repeat(parseInt(form.horizon_rating))}{'☆'.repeat(5-parseInt(form.horizon_rating))}
        </div>

        <label style={{ color: '#445566', fontSize: 9, letterSpacing: 1 }}>ACCESS NOTES</label>
        <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
          value={form.access_notes} onChange={e => set('access_notes', e.target.value)}
          placeholder="Parking, hiking required, restrictions..." />

        {status?.error && (
          <div style={{ color: '#ff5566', fontSize: 10 }}>{status.error}</div>
        )}

        <button type="submit" disabled={submitting} style={{
          ...inputStyle, cursor: 'pointer', color: '#44ddaa',
          border: '1px solid #44ddaa44', textAlign: 'center',
          letterSpacing: 2, marginTop: 4,
        }}>
          {submitting ? 'SUBMITTING...' : 'SUBMIT FOR REVIEW'}
        </button>
      </form>
    </div>
  )
}
