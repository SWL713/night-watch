import { useState } from 'react'
import { usePendingSpots, useSightings } from '../hooks/useSpots.js'
import { supabase, supabaseReady } from '../lib/supabase.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const btnStyle = (color) => ({
  flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
  background: '#060810', border: `1px solid ${color}44`,
  color, cursor: 'pointer', fontFamily: FONT,
})

export default function AdminQueue({ onClose, onViewOnMap }) {
  const {
    pending, pendingPhotos, flaggedPhotos, loading,
    approveSpot, rejectSpot, approvePhoto, rejectPhoto, deletePhoto, dismissFlag,
  } = usePendingSpots()

  const { sightings: allSightings, deleteSighting, reload: reloadSightings } = useSightings()
  const pendingRemovals = (allSightings || []).filter(s => s.removal_requested)

  const [tab, setTab] = useState('spots')

  async function dismissRemoval(id) {
    if (!supabase) return
    await supabase.from('sightings')
      .update({ removal_requested: false, removal_comment: null, removal_requested_at: null })
      .eq('id', id)
    reloadSightings()
  }

  async function handleDeleteSighting(id) {
    await deleteSighting(id)
    reloadSightings()
  }

  const tabs = [
    { key: 'spots',     label: `SPOTS${pending.length ? ` (${pending.length})` : ''}` },
    { key: 'photos',    label: `PHOTOS${pendingPhotos.length ? ` (${pendingPhotos.length})` : ''}` },
    { key: 'flagged',   label: `FLAGGED${flaggedPhotos.length ? ` (${flaggedPhotos.length})` : ''}` },
    { key: 'sightings', label: `SIGHTINGS${pendingRemovals.length ? ` (${pendingRemovals.length})` : ''}` },
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
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>x</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 12, flexWrap: 'wrap' }}>
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
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 6 }}>
                {new Date(spot.created_at).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => { onViewOnMap?.(spot.lat, spot.lon); onClose() }}
                  style={{ ...btnStyle('#44aaff'), flex: 1, fontSize: 8 }}>
                  Map View
                </button>
                <a href={`https://maps.apple.com/?ll=${spot.lat},${spot.lon}&q=${encodeURIComponent(spot.name)}`}
                  target="_blank" rel="noopener"
                  style={{ ...btnStyle('#44aaff'), flex: 1, fontSize: 8, textDecoration: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Apple Maps
                </a>
                <a href={`https://www.google.com/maps?q=${spot.lat},${spot.lon}`}
                  target="_blank" rel="noopener"
                  style={{ ...btnStyle('#44aaff'), flex: 1, fontSize: 8, textDecoration: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Google Maps
                </a>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => approveSpot(spot.id)} style={btnStyle('#22c55e')}>APPROVE</button>
                <button onClick={() => rejectSpot(spot.id)} style={btnStyle('#ef4444')}>REJECT</button>
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
                {photo.spots?.name || 'Unknown spot'}
              </div>
              {photo.photographer_name && (
                <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>{photo.photographer_name}</div>
              )}
              {photo.caption && <div style={{ color: '#334455', fontSize: 9, marginBottom: 4 }}>{photo.caption}</div>}
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
                {new Date(photo.created_at).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => approvePhoto(photo.id)} style={btnStyle('#22c55e')}>APPROVE</button>
                <button onClick={() => rejectPhoto(photo.id)} style={btnStyle('#ef4444')}>REJECT</button>
              </div>
            </div>
          ))
      )}

      {/* Flagged photos */}
      {!loading && tab === 'flagged' && (
        flaggedPhotos.length === 0
          ? <Empty text="No flagged photos" />
          : flaggedPhotos.map(photo => (
            <div key={photo.id} style={{ ...cardStyle, borderColor: '#cc330044' }}>
              <div style={{ color: '#cc4433', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>FLAGGED</div>
              <img src={photo.photo_url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 2, marginBottom: 6 }} />
              <div style={{ color: '#aabbcc', fontSize: 10, marginBottom: 2 }}>
                {photo.spots?.name || 'Unknown spot'}
              </div>
              {photo.photographer_name && (
                <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>{photo.photographer_name}</div>
              )}
              {photo.caption && <div style={{ color: '#334455', fontSize: 9, marginBottom: 4 }}>{photo.caption}</div>}
              <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
                Flagged: {photo.flagged_at ? new Date(photo.flagged_at).toLocaleString() : '-'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => deletePhoto(photo.id)} style={btnStyle('#ef4444')}>DELETE</button>
                <button onClick={() => dismissFlag(photo.id)} style={btnStyle('#445566')}>DISMISS</button>
              </div>
            </div>
          ))
      )}

      {/* Sighting removal requests */}
      {!loading && tab === 'sightings' && (
        pendingRemovals.length === 0
          ? <Empty text="No removal requests" />
          : pendingRemovals.map(s => (
            <SightingRemovalCard
              key={s.id}
              sighting={s}
              onDelete={() => handleDeleteSighting(s.id)}
              onDismiss={() => dismissRemoval(s.id)}
            />
          ))
      )}
    </div>
  )
}

function SightingRemovalCard({ sighting: s, onDelete, onDismiss }) {
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handle(action) {
    setBusy(true)
    await action()
    setBusy(false)
    setConfirm(null)
  }

  if (confirm === 'delete') return (
    <div style={{ ...cardStyle, borderColor: '#cc222244' }}>
      <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 6 }}>Delete this sighting?</div>
      <div style={{ color: '#556677', fontSize: 8, marginBottom: 10 }}>
        Permanently removes it from the map and database.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => handle(onDelete)} disabled={busy}
          style={btnStyle('#ef4444')}>{busy ? '...' : 'YES, DELETE'}</button>
        <button onClick={() => setConfirm(null)} style={btnStyle('#445566')}>CANCEL</button>
      </div>
    </div>
  )

  if (confirm === 'dismiss') return (
    <div style={cardStyle}>
      <div style={{ color: '#ffcc44', fontSize: 10, marginBottom: 6 }}>Dismiss this request?</div>
      <div style={{ color: '#556677', fontSize: 8, marginBottom: 10 }}>
        The sighting stays on the map and the removal request is cleared.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => handle(onDismiss)} disabled={busy}
          style={btnStyle('#ffcc44')}>{busy ? '...' : 'YES, DISMISS'}</button>
        <button onClick={() => setConfirm(null)} style={btnStyle('#445566')}>CANCEL</button>
      </div>
    </div>
  )

  return (
    <div style={{ ...cardStyle, borderColor: '#ff884444' }}>
      <div style={{ color: '#ff8844', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
        Removal Request
      </div>
      <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>
        {s.lat?.toFixed(4)}, {s.lon?.toFixed(4)}
      </div>
      <div style={{ color: '#334455', fontSize: 8, marginBottom: 6 }}>
        Submitted: {new Date(s.created_at).toLocaleString()}
      </div>
      {s.removal_comment && (
        <div style={{ background: '#0a0e18', border: '1px solid #1a2a3a',
          borderRadius: 2, padding: '5px 8px', marginBottom: 8,
          color: '#778899', fontSize: 9, fontStyle: 'italic' }}>
          "{s.removal_comment}"
        </div>
      )}
      {s.observations?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
          {s.observations.map(o => (
            <span key={o} style={{ background: '#0d2a1a', border: '1px solid #44ffaa33',
              color: '#44ffaa', fontSize: 8, padding: '2px 4px', borderRadius: 2 }}>{o}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setConfirm('delete')} style={btnStyle('#ef4444')}>DELETE</button>
        <button onClick={() => setConfirm('dismiss')} style={btnStyle('#445566')}>DISMISS</button>
      </div>
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
