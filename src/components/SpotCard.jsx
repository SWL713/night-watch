import { useState, useEffect } from 'react'
import { fetchSpotForecast } from '../hooks/useCloudCover.js'
import { flagPhoto, flagSpot } from '../hooks/useSpots.js'
import { combinedScore, locationScore, bortleScore, scoreToColor, scoreToLabel } from '../utils/scoring.js'

function calcChaseScore(cloudcover, bortle) {
  const bScore = bortleScore(bortle)
  const cScore = 1 - cloudcover
  if (cScore <= 0) return 0
  return cScore * bScore
}

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

function formatTime(dt) {
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York' })
}

export default function SpotCard({ spot, onClose, spaceWeather, onSubmitPhoto, adminAuthed, onAdminUpdate, onAdminDeleteSpot, onAdminDeletePhoto }) {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')
  const [flaggedIds, setFlaggedIds] = useState(new Set())
  const [spotFlagged, setSpotFlagged] = useState(false)

  // Admin state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSpotForecast(spot.lat, spot.lon)
      .then(f => { setForecast(f); setLoading(false) })
      .catch(() => setLoading(false))
  }, [spot.id])

  const locScore = locationScore(spot)
  const currentCloud = forecast?.[0]?.cloudcover ?? 50
  const chaseScoreNow = calcChaseScore(currentCloud / 100, spot.bortle)

  function startEdit() {
    setEditForm({
      name: spot.name || '',
      view_direction: spot.view_direction || '',
      bortle: spot.bortle || '',
      horizon_rating: spot.horizon_rating || 3,
      access_notes: spot.access_notes || '',
      address: spot.address || '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    await onAdminUpdate(spot.id, editForm)
    setSaving(false)
    setEditing(false)
  }

  async function handleDeleteSpot() {
    await onAdminDeleteSpot(spot.id)
    onClose()
  }

  async function handleDeletePhoto(photoId) {
    await onAdminDeletePhoto(photoId)
    setConfirmDeletePhoto(null)
  }

  const s = { background: '#07090f', border: '1px solid #1a2a3a', borderRadius: 4,
    padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12, position: 'relative' }

  // Confirm delete spot overlay
  if (confirmDelete) return (
    <div style={s}>
      <div style={{ color: '#ff4444', fontSize: 12, marginBottom: 12, letterSpacing: 0.5 }}>
        DELETE SPOT
      </div>
      <div style={{ color: '#aabbcc', fontSize: 11, marginBottom: 16 }}>
        Permanently delete <strong>{spot.name}</strong>? This cannot be undone.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleDeleteSpot} style={{
          flex: 1, padding: '8px 0', background: '#2a0808', border: '1px solid #ff4444',
          color: '#ff4444', cursor: 'pointer', fontFamily: FONT, fontSize: 10, letterSpacing: 1,
        }}>YES, DELETE</button>
        <button onClick={() => setConfirmDelete(false)} style={{
          flex: 1, padding: '8px 0', background: '#060810', border: '1px solid #1a2a3a',
          color: '#445566', cursor: 'pointer', fontFamily: FONT, fontSize: 10, letterSpacing: 1,
        }}>CANCEL</button>
      </div>
    </div>
  )

  return (
    <div style={s}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, color: '#aabbcc', flex: 1, paddingRight: 24 }}>
          {spot.name}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#445566',
          fontSize: 16, cursor: 'pointer', padding: 0, position: 'absolute', top: 12, right: 12,
        }}>✕</button>
      </div>

      {/* Admin toolbar */}
      {adminAuthed && !editing && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={startEdit} style={{
            flex: 1, padding: '4px 0', fontSize: 8, letterSpacing: 1,
            background: '#0a1a0a', border: '1px solid #2a5a2a',
            color: '#44aa44', cursor: 'pointer', fontFamily: FONT,
          }}>✏️ EDIT</button>
          <button onClick={() => setConfirmDelete(true)} style={{
            flex: 1, padding: '4px 0', fontSize: 8, letterSpacing: 1,
            background: '#1a0808', border: '1px solid #5a2222',
            color: '#ff4444', cursor: 'pointer', fontFamily: FONT,
          }}>🗑 DELETE SPOT</button>
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: '#44aa44', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>EDIT SPOT</div>
          {[
            ['name', 'Name'],
            ['view_direction', 'View Direction'],
            ['address', 'Address'],
            ['access_notes', 'Access Notes'],
          ].map(([key, label]) => (
            <div key={key}>
              <div style={{ color: '#334455', fontSize: 8, marginBottom: 2 }}>{label.toUpperCase()}</div>
              <input value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ width: '100%', background: '#060810', border: '1px solid #1a2a3a',
                  color: '#aabbcc', fontFamily: FONT, fontSize: 10, padding: '4px 6px', borderRadius: 2 }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#334455', fontSize: 8, marginBottom: 2 }}>BORTLE</div>
              <input type="number" min={1} max={9} value={editForm.bortle || ''} onChange={e => setEditForm(p => ({ ...p, bortle: parseInt(e.target.value) }))}
                style={{ width: '100%', background: '#060810', border: '1px solid #1a2a3a',
                  color: '#aabbcc', fontFamily: FONT, fontSize: 10, padding: '4px 6px', borderRadius: 2 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#334455', fontSize: 8, marginBottom: 2 }}>HORIZON ★</div>
              <input type="number" min={1} max={5} value={editForm.horizon_rating || ''} onChange={e => setEditForm(p => ({ ...p, horizon_rating: parseInt(e.target.value) }))}
                style={{ width: '100%', background: '#060810', border: '1px solid #1a2a3a',
                  color: '#aabbcc', fontFamily: FONT, fontSize: 10, padding: '4px 6px', borderRadius: 2 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={saveEdit} disabled={saving} style={{
              flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
              background: '#0a1a0a', border: '1px solid #44aa44',
              color: '#44aa44', cursor: 'pointer', fontFamily: FONT,
            }}>{saving ? 'SAVING...' : 'SAVE'}</button>
            <button onClick={() => setEditing(false)} style={{
              flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
              background: '#060810', border: '1px solid #1a2a3a',
              color: '#445566', cursor: 'pointer', fontFamily: FONT,
            }}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Score pair */}
      {!editing && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <ScoreBox label="LOCATION" score={locScore} />
          <ScoreBox label="CHASE NOW" score={chaseScoreNow} />
        </div>
      )}

      {/* Tabs */}
      {!editing && (
        <div style={{ display: 'flex', gap: 1, marginBottom: 10 }}>
          {['info', 'forecast', 'photos'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '4px 0', fontSize: 9, letterSpacing: 1,
              background: tab === t ? '#0d1a2a' : '#060810',
              border: `1px solid ${tab === t ? '#44ddaa44' : '#1a2035'}`,
              color: tab === t ? '#44ddaa' : '#445566',
              cursor: 'pointer', fontFamily: FONT,
            }}>{t.toUpperCase()}</button>
          ))}
        </div>
      )}

      {!editing && tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="View" value={spot.view_direction} />
          <Row label="Bortle" value={spot.bortle} />
          <Row label="Horizon" value={'★'.repeat(spot.horizon_rating || 3) + '☆'.repeat(5-(spot.horizon_rating||3))} />
          {spot.access_notes && <Row label="Access" value={spot.access_notes} small />}
          {spot.address && <Row label="Address" value={spot.address} small />}
          <div style={{ color: '#223344', fontSize: 8, marginTop: 4 }}>
            {spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}
          </div>

          {/* Directions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <a href={`https://maps.apple.com/?daddr=${spot.address ? encodeURIComponent(spot.address) : `${spot.lat},${spot.lon}`}&dirflg=d`}
              target="_blank" rel="noopener" style={{
                flex: 1, padding: '6px 0', fontSize: 8, letterSpacing: 1,
                background: '#060810', border: '1px solid #1a3a5a',
                color: '#44aaff', textDecoration: 'none', textAlign: 'center',
                borderRadius: 2, fontFamily: FONT, display: 'block',
              }}>🍎 Apple Maps</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${spot.address ? encodeURIComponent(spot.address) : `${spot.lat},${spot.lon}`}`}
              target="_blank" rel="noopener" style={{
                flex: 1, padding: '6px 0', fontSize: 8, letterSpacing: 1,
                background: '#060810', border: '1px solid #1a3a5a',
                color: '#44aaff', textDecoration: 'none', textAlign: 'center',
                borderRadius: 2, fontFamily: FONT, display: 'block',
              }}>🌐 Google Maps</a>
          </div>

          {/* Flag spot */}
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            {!spotFlagged ? (
              <button onClick={async () => { await flagSpot(spot.id); setSpotFlagged(true) }}
                style={{ background: 'none', border: 'none', color: '#334455',
                  fontSize: 9, cursor: 'pointer', fontFamily: FONT }}>
                🚩 Flag this location
              </button>
            ) : (
              <span style={{ color: '#445566', fontSize: 9 }}>flagged for review</span>
            )}
          </div>
        </div>
      )}

      {!editing && tab === 'forecast' && (
        <div>
          {loading ? (
            <div style={{ color: '#445566', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading forecast...</div>
          ) : forecast ? (
            <div>
              <div style={{ color: '#334455', fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                CLOUD COVER · NEXT 8 HRS · {spot.lat.toFixed(2)},{spot.lon.toFixed(2)}
              </div>
              {forecast.slice(0, 9).map((pt, i) => {
                const score = calcChaseScore(pt.cloudcover / 100, spot.bortle)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#445566', fontSize: 9, width: 42 }}>
                      {i === 0 ? 'NOW' : formatTime(pt.time)}
                    </span>
                    <div style={{ flex: 1, height: 8, background: '#0a0e18', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pt.cloudcover}%`,
                        background: pt.cloudcover >= 80 ? '#cc2222' : pt.cloudcover >= 50 ? '#cc7700' : '#2a6a4a',
                      }} />
                    </div>
                    <span style={{ color: scoreToColor(score, 1), fontSize: 9, width: 28, textAlign: 'right' }}>
                      {pt.cloudcover}%
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ color: '#445566', fontSize: 11, textAlign: 'center', padding: 16 }}>Forecast unavailable</div>
          )}
        </div>
      )}

      {!editing && tab === 'photos' && (
        <div>
          {spot.photos && spot.photos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {spot.photos.filter(p => !p.deleted).map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {confirmDeletePhoto === p.id ? (
                    <div style={{ background: '#1a0808', border: '1px solid #5a2222',
                      borderRadius: 2, padding: 10, marginBottom: 4 }}>
                      <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 8 }}>Delete this photo?</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleDeletePhoto(p.id)} style={{
                          flex: 1, padding: '4px 0', background: '#2a0808', border: '1px solid #ff4444',
                          color: '#ff4444', cursor: 'pointer', fontFamily: FONT, fontSize: 9,
                        }}>YES</button>
                        <button onClick={() => setConfirmDeletePhoto(null)} style={{
                          flex: 1, padding: '4px 0', background: '#060810', border: '1px solid #1a2a3a',
                          color: '#445566', cursor: 'pointer', fontFamily: FONT, fontSize: 9,
                        }}>NO</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <img src={p.photo_url} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 2 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 3 }}>
                        <div>
                          {p.caption && <div style={{ color: '#778899', fontSize: 9 }}>{p.caption}</div>}
                          {p.photographer_name && <div style={{ color: '#445566', fontSize: 8, marginTop: 1 }}>📷 {p.photographer_name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {adminAuthed && (
                            <button onClick={() => setConfirmDeletePhoto(p.id)} style={{
                              background: 'none', border: 'none', color: '#ff4444',
                              fontSize: 10, cursor: 'pointer', padding: '0 2px',
                            }} title="Delete photo">🗑</button>
                          )}
                          {!flaggedIds.has(p.id) ? (
                            <button onClick={async () => { await flagPhoto(p.id); setFlaggedIds(prev => new Set([...prev, p.id])) }}
                              style={{ background: 'none', border: 'none', color: '#334455',
                                fontSize: 10, cursor: 'pointer', padding: '0 2px' }} title="Flag photo">🚩</button>
                          ) : (
                            <span style={{ color: '#445566', fontSize: 8 }}>flagged</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#334455', fontSize: 11, textAlign: 'center', padding: 16 }}>No photos yet</div>
          )}
          <button onClick={() => onSubmitPhoto(spot)} style={{
            marginTop: 8, width: '100%', padding: '6px 0', fontSize: 10,
            background: '#060810', border: '1px solid #1a2a3a',
            color: '#44ddaa', cursor: 'pointer', fontFamily: FONT, letterSpacing: 1,
          }}>+ SUBMIT A PHOTO</button>
        </div>
      )}
    </div>
  )
}

function ScoreBox({ label, score }) {
  const color = scoreToColor(score, 1)
  const pct = Math.round(score * 100)
  return (
    <div style={{ flex: 1, background: '#060810', border: `1px solid ${color}33`,
      borderRadius: 2, padding: '6px 8px', textAlign: 'center' }}>
      <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 'bold' }}>{pct}</div>
      <div style={{ color: color + 'aa', fontSize: 8 }}>{scoreToLabel(score)}</div>
    </div>
  )
}

function Row({ label, value, small }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color: '#334455', fontSize: 9, letterSpacing: 1, width: 52, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#aabbcc', fontSize: small ? 10 : 11 }}>{value}</span>
    </div>
  )
}
