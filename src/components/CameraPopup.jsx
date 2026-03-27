const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function CameraPopup({ camera, onClose }) {
  if (!camera) return null

  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 2500,
      background: '#07090f',
      border: '1px solid #44aaff44',
      borderRadius: 6,
      boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
      overflow: 'hidden',
      width: 'min(520px, 92vw)',
      fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px',
        background: '#060810',
        borderBottom: '1px solid #1a2a3a',
      }}>
        <div style={{ color: '#44aaff', fontSize: 10, letterSpacing: 1 }}>
          📹 {camera.name}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none',
          color: '#445566', fontSize: 18, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Embed */}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
        <iframe
          src={camera.embedUrl}
          title={camera.name}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            border: 'none',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" 
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 12px',
        color: '#1e2e40', fontSize: 8, letterSpacing: 0.5,
        background: '#060810', borderTop: '1px solid #0d1525',
      }}>
        {camera.lat.toFixed(4)}, {camera.lon.toFixed(4)}
      </div>
    </div>
  )
}
