import { useState } from 'react'
import { usePendingSpots } from '../hooks/useSpots.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const btnStyle = (color) => ({
  flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
  background: '#060810', border: `1px solid ${color}44`,
  color, cursor: 'pointer', fontFamily: FONT,
})

export default function AdminQueue({ onClose }) {
  const {
    pending, pendingPhotos, flaggedPhotos, loading,
    approveSpot, rejectSpot, approvePhoto, rejectPhoto, deletePhoto, dismissFlag,
  } = usePendingSpots()

  const [tab, setTab] = useState('spots')

  const tabs = [
    { key: 'spots',   label: `SPOTS${pending.length ? ` (${pending.length})` : ''}` },
    { key: 'photos',  label: `PHOTOS${pendingPhotos.length ? ` (${pendingPhotos.length})` : ''}` },
    { key: 'flagged', label: `FLAGGED${flaggedPhotos.length ? ` (${flaggedPhotos.length})` : ''}` },
  ]

  return (
    <div style={{
      background: '#070b16', border: '1px solid #cc8800',
      borderRadius: 4, padding: 16, width: 360,
      fontFamily: FONT, color: '#ccd', fontSize: 12,
      maxHeight: '80vh', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: '#cc8800', fontSize: 12, letterSpacing: 2 }}>ADMIN QUEUE</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '4px 0', fontSize: 8, letterSpacing: 1,
            background: tab === t.key ? '#0d1a2a' : '#060810',
            border: `1px solid ${tab === t.key ? '#cc880044' : '#1a2035'}`,
            color: tab === t.key ? '#cc8800' : '#445566',
            cursor: 'pointer', fontFamily: FONT,
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#445566', textAlign: 'center', padding: 16 }}>Loading...</div>}

      {/* Pending spots */}
      {!loading && tab === 'spots' && (
        pending.length === 0
          ? <Empty text="No pending locations" />
          : pending.map(spot => (
            <div key={spot.id} style={cardStyle}>
              <div style={{ fontWeight: 'bold', color: '#aabbcc', marginBottom: 4 }}>{spot.name}</div>
              <div style={{ color: '#445566', fontSize: 10, marginBottom: 2 }}>
                {spot.lat?.toFixed(4)}, {spot.lon?.toFixed(4)} · Bortle {spot.bortle} · {spot.view_direction}
              </div>
              {spot.access_notes && <div style={{ color: '#334455', fontSize: 10, marginBottom: 4 }}>{spot.access_notes}</div>}
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
                {new Date(spot.created_at).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => approveSpot(spot.id)} style={btnStyle('#22c55e')}>✓ APPROVE</button>
                <button onClick={() => rejectSpot(spot.id)} style={btnStyle('#ef4444')}>✕ REJECT</button>
              </div>
            </div>
          ))
      )}

      {/* Pending photos */}
      {!loading && tab === 'photos' && (
        pendingPhotos.length === 0
          ? <Empty text="No pending photos" />
          : pendingPhotos.map(photo => (
            <div key={photo.id} style={cardStyle}>
              <img src={photo.photo_url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 2, marginBottom: 6 }} />
              <div style={{ color: '#aabbcc', fontSize: 10, marginBottom: 2 }}>
                📍 {photo.spots?.name || 'Unknown spot'}
              </div>
              {photo.photographer_name && (
                <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>📷 {photo.photographer_name}</div>
              )}
              {photo.caption && <div style={{ color: '#334455', fontSize: 9, marginBottom: 4 }}>{photo.caption}</div>}
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
                {new Date(photo.created_at).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => approvePhoto(photo.id)} style={btnStyle('#22c55e')}>✓ APPROVE</button>
                <button onClick={() => rejectPhoto(photo.id)} style={btnStyle('#ef4444')}>✕ REJECT</button>
              </div>
            </div>
          ))
      )}

      {/* Flagged approved photos */}
      {!loading && tab === 'flagged' && (
        flaggedPhotos.length === 0
          ? <Empty text="No flagged photos" />
          : flaggedPhotos.map(photo => (
            <div key={photo.id} style={{ ...cardStyle, borderColor: '#cc330044' }}>
              <div style={{ color: '#cc4433', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>🚩 FLAGGED</div>
              <img src={photo.photo_url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 2, marginBottom: 6 }} />
              <div style={{ color: '#aabbcc', fontSize: 10, marginBottom: 2 }}>
                📍 {photo.spots?.name || 'Unknown spot'}
              </div>
              {photo.photographer_name && (
                <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>📷 {photo.photographer_name}</div>
              )}
              {photo.caption && <div style={{ color: '#334455', fontSize: 9, marginBottom: 4 }}>{photo.caption}</div>}
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
                Flagged: {photo.flagged_at ? new Date(photo.flagged_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => deletePhoto(photo.id)} style={btnStyle('#ef4444')}>🗑 DELETE</button>
                <button onClick={() => dismissFlag(photo.id)} style={btnStyle('#445566')}>DISMISS</button>
              </div>
            </div>
          ))
      )}
    </div>
  )
}

const cardStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  borderRadius: 2, padding: 12, marginBottom: 8,
}

function Empty({ text }) {
  return (
    <div style={{ color: '#334455', textAlign: 'center', padding: 24, fontSize: 11 }}>{text}</div>
  )
}
