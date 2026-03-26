import { Popup } from 'react-leaflet'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function SightingPopup({ sighting, position, adminAuthed, onDelete, onClose }) {
  if (!sighting || !position) return null

  const age    = Date.now() - new Date(sighting.created_at).getTime()
  const minsAgo = Math.round(age / 60000)
  const timeLabel = minsAgo < 60
    ? `${minsAgo}m ago`
    : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`

  const remaining = 5 * 60 - Math.round(age / 60000)
  const expiresLabel = remaining > 60
    ? `expires in ${Math.floor(remaining / 60)}h ${remaining % 60}m`
    : `expires in ${remaining}m`

  return (
    <Popup position={position} onClose={onClose}
      eventHandlers={{ remove: onClose }}>
      <div style={{ fontFamily: FONT, minWidth: 180 }}>
        <div style={{ color: '#44ffaa', fontSize: 11, fontWeight: 'bold',
          letterSpacing: 1, marginBottom: 6 }}>
          🌌 AURORA SIGHTING
        </div>

        <div style={{ color: '#778899', fontSize: 9, marginBottom: 8 }}>
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
                  borderRadius: 2, fontFamily: FONT,
                }}>{obs}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ color: '#223344', fontSize: 8 }}>
          {sighting.lat.toFixed(4)}, {sighting.lon.toFixed(4)}
        </div>

        {adminAuthed && (
          <button
            onClick={() => { onDelete(sighting.id); onClose() }}
            style={{
              marginTop: 8, width: '100%', padding: '4px 0', fontSize: 9,
              background: '#1a0505', border: '1px solid #cc222244',
              color: '#ff4444', cursor: 'pointer', fontFamily: FONT,
              letterSpacing: 1,
            }}>
            🗑 DELETE SIGHTING
          </button>
        )}
      </div>
    </Popup>
  )
}
