import { useState } from 'react'
import { isMySubmittedSighting, undoSighting, requestSightingRemoval } from '../hooks/useSpots.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '5px 8px', fontSize: 9,
  fontFamily: FONT, outline: 'none', borderRadius: 2,
  width: '100%', boxSizing: 'border-box', resize: 'vertical',
}

export default function SightingPopup({ sighting, screenPos, adminAuthed, onDelete, onClose, onRefresh }) {
  const [view, setView] = useState('main')
  const [removalComment, setRemovalComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!sighting || !screenPos) return null

  const isMine = isMySubmittedSighting(sighting.id)
  const age = Date.now() - new Date(sighting.created_at).getTime()
  const minsAgo = Math.round(age / 60000)
  const timeLabel = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`
  const remaining = 5 * 60 - minsAgo
  const expiresLabel = remaining > 60 ? `expires in ${Math.floor(remaining / 60)}h ${remaining % 60}m` : `expires in ${Math.max(0, remaining)}m`

  async function handleUndo() {
    setSubmitting(true)
    const { error } = await undoSighting(sighting.id)
    setSubmitting(false)
    if (error) { setError(error.message || 'Failed'); return }
    onRefresh?.()
    onClose()
  }

  async function handleRequestRemoval() {
    if (!removalComment.trim()) { setError('Please add a reason'); return }
    setSubmitting(true)
    const { error } = await requestSightingRemoval(sighting.id, removalComment.trim())
    setSubmitting(false)
    if (error) { setError(error.message || 'Failed'); return }
    setView('done')
  }

  async function handleAdminDelete() {
    setSubmitting(true)
    await onDelete(sighting.id)
    setSubmitting(false)
    onClose()
  }

  const containerStyle = {
    position: 'absolute',
    left: Math.min(screenPos.x + 12, window.innerWidth - 225),
    top: Math.max(10, screenPos.y - 20),
    zIndex: 1200,
    background: '#070b16',
    border: '1px solid #44ffaa44',
    borderRadius: 4,
    padding: '10px 12px',
    minWidth: 200,
    maxWidth: 220,
    fontFamily: FONT,
    boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
    pointerEvents: 'all',
  }

  const btnPrimary = (color) => ({
    flex: 1, padding: '6px 0', fontSize: 9,
    background: color + '11', border: `1px solid ${color}`,
    color, cursor: 'pointer', fontFamily: FONT,
  })

  const btnCancel = {
    flex: 1, padding: '6px 0', fontSize: 9,
    background: 'none', border: '1px solid #1a2a3a',
    color: '#445566', cursor: 'pointer', fontFamily: FONT,
  }

  if (view === 'done') return (
    <div style={containerStyle}>
      <div style={{ color: '#44ffaa', fontSize: 10, marginBottom: 6 }}>✓ Removal requested</div>
      <div style={{ color: '#445566', fontSize: 8, marginBottom: 10 }}>An admin will review and remove your sighting.</div>
      <button onClick={onClose} style={{ ...btnCancel, width: '100%' }}>CLOSE</button>
    </div>
  )

  if (view === 'confirmUndo') return (
    <div style={containerStyle}>
      <div style={{ color: '#ffcc44', fontSize: 10, marginBottom: 6 }}>Undo this sighting?</div>
      <div style={{ color: '#556677', fontSize: 8, marginBottom: 10 }}>Your sighting will be immediately removed from the map.</div>
      {error && <div style={{ color: '#ff5566', fontSize: 8, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleUndo} disabled={submitting} style={btnPrimary('#ffcc44')}>
          {submitting ? '...' : 'YES, UNDO'}
        </button>
        <button onClick={() => { setView('main'); setError(null) }} style={btnCancel}>CANCEL</button>
      </div>
    </div>
  )

  if (view === 'requestRemoval') return (
    <div style={containerStyle}>
      <div style={{ color: '#ff8844', fontSize: 10, marginBottom: 6 }}>Request Removal</div>
      <div style={{ color: '#445566', fontSize: 8, marginBottom: 6 }}>Add a reason — an admin will review and remove it.</div>
      <textarea style={{ ...inputStyle, minHeight: 55, marginBottom: 6 }}
        value={removalComment} onChange={e => setRemovalComment(e.target.value)}
        placeholder="e.g. submitted by accident, wrong location..." />
      {error && <div style={{ color: '#ff5566', fontSize: 8, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleRequestRemoval} disabled={submitting} style={btnPrimary('#ff8844')}>
          {submitting ? '...' : 'SUBMIT'}
        </button>
        <button onClick={() => { setView('main'); setError(null) }} style={btnCancel}>CANCEL</button>
      </div>
    </div>
  )

  if (view === 'confirmAdminDelete') return (
    <div style={containerStyle}>
      <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 6 }}>Delete this sighting?</div>
      <div style={{ color: '#556677', fontSize: 8, marginBottom: 10 }}>This permanently removes it from the map and database.</div>
      {error && <div style={{ color: '#ff5566', fontSize: 8, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleAdminDelete} disabled={submitting} style={btnPrimary('#ff4444')}>
          {submitting ? '...' : 'YES, DELETE'}
        </button>
        <button onClick={() => { setView('main'); setError(null) }} style={btnCancel}>CANCEL</button>
      </div>
    </div>
  )

  // Main view
  return (
    <div style={containerStyle}>
      <button onClick={onClose} style={{ position: 'absolute', top: 6, right: 8,
        background: 'none', border: 'none', color: '#445566', fontSize: 14, cursor: 'pointer' }}>✕</button>

      <div style={{ color: '#44ffaa', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 4 }}>
        🌌 AURORA SIGHTING
      </div>
      <div style={{ color: '#556677', fontSize: 9, marginBottom: 8 }}>
        {timeLabel} · {expiresLabel}
      </div>

      {sighting.observations?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>OBSERVED</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {sighting.observations.map(obs => (
              <span key={obs} style={{ background: '#0d2a1a', border: '1px solid #44ffaa44',
                color: '#44ffaa', fontSize: 8, padding: '2px 5px', borderRadius: 2 }}>{obs}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ color: '#223344', fontSize: 8, marginBottom: 8 }}>
        {sighting.lat?.toFixed(4)}, {sighting.lon?.toFixed(4)}
      </div>

      {/* Undo — same device */}
      {isMine && (
        <button onClick={() => setView('confirmUndo')} style={{
          ...btnPrimary('#ffcc44'), width: '100%', marginBottom: 4 }}>
          ↩ UNDO MY SIGHTING
        </button>
      )}

      {/* Request removal — different device */}
      {!isMine && (
        <button onClick={() => setView('requestRemoval')} style={{
          width: '100%', padding: '5px 0', fontSize: 9, marginBottom: 4,
          background: 'none', border: '1px solid #223344',
          color: '#445566', cursor: 'pointer', fontFamily: FONT }}>
          ✉ REQUEST REMOVAL
        </button>
      )}

      {/* Admin delete */}
      {adminAuthed && (
        <button onClick={() => setView('confirmAdminDelete')} style={{
          ...btnPrimary('#ff4444'), width: '100%' }}>
          🗑 ADMIN DELETE
        </button>
      )}
    </div>
  )
}
