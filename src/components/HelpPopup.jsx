// HelpPopup — shown when user taps an element in help mode.
// No Leaflet imports — safe module boundary.

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function HelpPopup({ title, text, onClose }) {
  if (!title && !text) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9998,
        padding: '0 20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#07090f',
          border: '1px solid #44ddaa',
          borderRadius: 6,
          padding: '16px 18px',
          maxWidth: 340, width: '100%',
          fontFamily: FONT,
          boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 10,
        }}>
          <span style={{
            color: '#44ddaa', fontSize: 10,
            letterSpacing: 2, fontFamily: FONT,
          }}>
            {title?.toUpperCase()}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: '#445566', fontSize: 16,
              cursor: 'pointer', lineHeight: 1,
              padding: '0 0 0 12px', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{
          color: '#aabbcc', fontSize: 11,
          lineHeight: 1.7, fontFamily: FONT,
        }}>
          {text.split('\n\n').map((para, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0 0' }}>{para}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
