const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function TimeSlider({ value, onChange }) {
  const now = new Date()

  function label(offset) {
    if (offset === 0) return 'NOW'
    const dt = new Date(now.getTime() + offset * 3600000)
    return dt.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/New_York',
    })
  }

  return (
    <div style={{
      background: '#06080f',
      borderTop: '1px solid #1a2035',
      fontFamily: FONT,
      userSelect: 'none',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* Single row: ◀ label slider ▶ — no header, no hour buttons */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '4px 8px 4px', gap: 6,
      }}>
        <button
          onPointerDown={e => { e.preventDefault(); onChange(Math.max(0, value - 1)) }}
          style={{
            background: value > 0 ? '#0d1a2a' : '#060810',
            border: `1px solid ${value > 0 ? '#2a3a5a' : '#1a2035'}`,
            color: value > 0 ? '#7799bb' : '#1e2a3a',
            width: 36, height: 36, borderRadius: 4,
            fontSize: 16, cursor: value > 0 ? 'pointer' : 'default',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >◀</button>

        {/* Label shows current state */}
        <span style={{
          color: value === 0 ? '#ffffff' : '#44ddaa',
          fontSize: 10, fontWeight: 'bold', letterSpacing: 1,
          flexShrink: 0, minWidth: 90, textAlign: 'center',
        }}>
          {value === 0 ? '▶ NOW' : `+${value}h → ${label(value)}`}
        </span>

        {/* Slider track */}
        <div style={{ flex: 1, position: 'relative', height: 36, display: 'flex', alignItems: 'center' }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 6,
            background: '#0a0e18', borderRadius: 3, border: '1px solid #1a2035',
          }} />
          <div style={{
            position: 'absolute', left: 0,
            width: `${(value / 8) * 100}%`,
            height: 6, background: '#44ddaa33', borderRadius: 3,
          }} />
          <input
            type="range" min="0" max="8" step="1" value={value}
            onChange={e => onChange(parseInt(e.target.value))}
            style={{
              position: 'relative', width: '100%',
              appearance: 'none', WebkitAppearance: 'none',
              background: 'transparent', height: 36,
              cursor: 'pointer', margin: 0, touchAction: 'manipulation',
            }}
          />
        </div>

        <button
          onPointerDown={e => { e.preventDefault(); onChange(Math.min(8, value + 1)) }}
          style={{
            background: value < 8 ? '#0d1a2a' : '#060810',
            border: `1px solid ${value < 8 ? '#2a3a5a' : '#1a2035'}`,
            color: value < 8 ? '#7799bb' : '#1e2a3a',
            width: 36, height: 36, borderRadius: 4,
            fontSize: 16, cursor: value < 8 ? 'pointer' : 'default',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >▶</button>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px; height: 24px;
          border-radius: 50%;
          background: #44ddaa;
          border: 3px solid #06080f;
          box-shadow: 0 0 8px #44ddaa66;
          cursor: grab;
        }
        input[type=range]::-moz-range-thumb {
          width: 24px; height: 24px;
          border-radius: 50%;
          background: #44ddaa;
          border: 3px solid #06080f;
          box-shadow: 0 0 8px #44ddaa66;
          cursor: grab;
        }
        input[type=range]::-webkit-slider-runnable-track {
          background: transparent; height: 6px;
        }
        input[type=range]:active::-webkit-slider-thumb { cursor: grabbing; }
      `}</style>
    </div>
  )
}
