import { useState, useEffect } from 'react'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function CameraPopup({ camera, onClose }) {
  const [imgSrc, setImgSrc] = useState(null)
  const [imgError, setImgError] = useState(false)

  // Refresh image every 60 seconds with cache-busting
  useEffect(() => {
    if (!camera?.image_url) return
    function refresh() {
      setImgError(false)
      setImgSrc(`${camera.image_url}?t=${Date.now()}`)
    }
    refresh()
    const iv = setInterval(refresh, 60000)
    return () => clearInterval(iv)
  }, [camera?.image_url])

  if (!camera) return null

  const watchUrl = camera.embed_url
    .replace('/embed/', '/watch?v=')
    .replace('?si=', '&si=')
    .split('&autoplay')[0]
    .split('&mute')[0]
    .split('&origin')[0]

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
      width: 'min(480px, 92vw)',
      fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: '#060810',
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

      {/* Image */}
      {imgSrc && !imgError ? (
        <div style={{ position: 'relative', background: '#000' }}>
          <img
            src={imgSrc}
            alt={camera.name}
            onError={() => setImgError(true)}
            style={{ width: '100%', display: 'block' }}
          />
          <div style={{
            position: 'absolute', bottom: 4, right: 6,
            color: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: FONT,
          }}>
            updates every 60s
          </div>
        </div>
      ) : (
        <div style={{
          width: '100%', height: 180,
          background: '#060810',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#334455', fontSize: 9, fontFamily: FONT,
        }}>
          {imgError ? 'Image unavailable' : 'Loading...'}
        </div>
      )}

      {/* Watch Live button */}
      <div style={{ padding: '10px 12px', background: '#060810', borderTop: '1px solid #0d1525' }}>
        <a
          href={camera.type === 'youtube' ? watchUrl : camera.embed_url}
          target="_blank"
          rel="noopener"
          style={{
            display: 'block', width: '100%', padding: '7px 0',
            background: '#001a2a', border: '1px solid #44aaff',
            color: '#44aaff', fontSize: 10, fontFamily: FONT,
            letterSpacing: 1, textAlign: 'center', textDecoration: 'none',
            borderRadius: 2, boxSizing: 'border-box',
          }}
        >
          ▶ WATCH LIVE
        </a>
        <div style={{ color: '#1e2e40', fontSize: 7, textAlign: 'center', marginTop: 5 }}>
          {camera.lat?.toFixed(4)}, {camera.lon?.toFixed(4)}
        </div>
      </div>
    </div>
  )
}
