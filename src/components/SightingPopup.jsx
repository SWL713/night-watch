// Rendered as an absolutely positioned div over the map — not a Leaflet Popup
// so it doesn't get closed by map click events

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function SightingPopup({ sighting, screenPos, adminAuthed, onDelete, onClose }) {
  if (!sighting || !screenPos) return null

  const age      = Date.now() - new Date(sighting.created_at).getTime()
  const minsAgo  = Math.round(age / 60000)
  const timeLabel = minsAgo < 60
    ? `${minsAgo}m ago`
    : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`
  const remaining = 5 * 60 - minsAgo
  const expiresLabel = remaining > 60
    ? `expires in ${Math.floor(remaining / 60)}h ${remaining % 60}m`
    : `expires in ${Math.max(0, remaining)}m`

  return (
    <div style={{
      position: 'absolute',
      left: screenPos.x + 12,
      top:  screenPos.y - 20,
      zIndex: 1200,
      background: '#070b16',
      border: '1px solid #44ffaa44',
      borderRadius: 4,
      padding: '10px 12px',
      minWidth: 190,
      fontFamily: FONT,
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
      pointerEvents: 'all',
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 6, right: 8,
        background: 'none', border: 'none', color: '#445566',
        fontSize: 14, cursor: 'pointer', padding: 0,
      }}>✕</button>

      <div style={{ color: '#44ffaa', fontSize: 11, fontWeight: 'bold',
        letterSpacing: 1, marginBottom: 4 }}>
        🌌 AURORA SIGHTING
      </div>

      <div style={{ color: '#556677', fontSize: 9, marginBottom: 8 }}>
        {timeLabel} · {expiresLabel}
      </div>

      {sighting.observations?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
            OBSERVED
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {sighting.observations.map(obs => (
              <span key={obs} style={{
                background: '#0d2a1a', border: '1px solid #44ffaa44',
                color: '#44ffaa', fontSize: 8, padding: '2px 5px',
                borderRadius: 2,
              }}>{obs}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ color: '#223344', fontSize: 8, marginBottom: adminAuthed ? 8 : 0 }}>
        {sighting.lat.toFixed(4)}, {sighting.lon.toFixed(4)}
      </div>

      {adminAuthed && (
        <button onClick={() => { onDelete(sighting.id); onClose() }} style={{
          width: '100%', padding: '5px 0', fontSize: 9, letterSpacing: 1,
          background: '#1a0505', border: '1px solid #cc222244',
          color: '#ff4444', cursor: 'pointer', fontFamily: FONT,
        }}>
          🗑 DELETE SIGHTING
        </button>
      )}
    </div>
  )
}
