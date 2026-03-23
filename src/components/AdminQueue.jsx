import { usePendingSpots } from '../hooks/useSpots.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function AdminQueue({ onClose }) {
  const { pending, loading, approveSpot, rejectSpot } = usePendingSpots()

  return (
    <div style={{
      background: '#070b16', border: '1px solid #cc8800',
      borderRadius: 4, padding: 16, width: 340,
      fontFamily: FONT, color: '#ccd', fontSize: 12,
      maxHeight: '80vh', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: '#cc8800', fontSize: 12, letterSpacing: 2 }}>
          APPROVAL QUEUE {pending.length > 0 && `· ${pending.length}`}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {loading && <div style={{ color: '#445566', textAlign: 'center', padding: 16 }}>Loading...</div>}

      {!loading && pending.length === 0 && (
        <div style={{ color: '#334455', textAlign: 'center', padding: 24, fontSize: 11 }}>
          No pending submissions
        </div>
      )}

      {pending.map(spot => (
        <div key={spot.id} style={{
          background: '#060810', border: '1px solid #1a2a3a',
          borderRadius: 2, padding: 12, marginBottom: 8,
        }}>
          <div style={{ fontWeight: 'bold', color: '#aabbcc', marginBottom: 6 }}>{spot.name}</div>
          <div style={{ color: '#445566', fontSize: 10, marginBottom: 4 }}>
            {spot.lat}, {spot.lon} · Bortle {spot.bortle} · View {spot.view_direction}
          </div>
          {spot.access_notes && (
            <div style={{ color: '#334455', fontSize: 10, marginBottom: 8 }}>{spot.access_notes}</div>
          )}
          <div style={{ color: '#223344', fontSize: 9, marginBottom: 8 }}>
            Submitted: {new Date(spot.created_at).toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => approveSpot(spot.id)} style={{
              flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
              background: '#051a0a', border: '1px solid #22c55e44',
              color: '#22c55e', cursor: 'pointer', fontFamily: FONT,
            }}>✓ APPROVE</button>
            <button onClick={() => rejectSpot(spot.id)} style={{
              flex: 1, padding: '6px 0', fontSize: 9, letterSpacing: 1,
              background: '#1a0505', border: '1px solid #ef444444',
              color: '#ef4444', cursor: 'pointer', fontFamily: FONT,
            }}>✕ REJECT</button>
          </div>
        </div>
      ))}
    </div>
  )
}
