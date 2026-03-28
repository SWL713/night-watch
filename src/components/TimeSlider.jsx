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
      paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 34px)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 16px 4px',
      }}>
        <span style={{ color: '#334455', fontSize: 9, letterSpacing: 1 }}>
          FORECAST TIME
        </span>
        <span style={{
          color: value === 0 ? '#ffffff' : '#44ddaa',
          fontSize: 12, fontWeight: 'bold', letterSpacing: 1,
        }}>
          {value === 0 ? '▶ NOW' : `+${value}h  →  ${label(value)} EDT`}
        </span>
      </div>

      {/* Main slider row: ◀ buttons + range + ▶ */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 8px 4px', gap: 8,
      }}>
        {/* Back button */}
        <button
          onPointerDown={e => { e.preventDefault(); onChange(Math.max(0, value - 1)) }}
          style={{
            background: value > 0 ? '#0d1a2a' : '#060810',
            border: `1px solid ${value > 0 ? '#2a3a5a' : '#1a2035'}`,
            color: value > 0 ? '#7799bb' : '#1e2a3a',
            width: 44, height: 44, borderRadius: 4,
            fontSize: 18, cursor: value > 0 ? 'pointer' : 'default',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >◀</button>

        {/* Slider track area */}
        <div style={{ flex: 1, position: 'relative', height: 44, display: 'flex', alignItems: 'center' }}>
          {/* Custom track background */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 8,
            background: '#0a0e18', borderRadius: 4,
            border: '1px solid #1a2035',
          }} />
          {/* Filled portion */}
          <div style={{
            position: 'absolute', left: 0,
            width: `${(value / 8) * 100}%`,
            height: 8, background: '#44ddaa33',
            borderRadius: 4,
          }} />

          <input
            type="range"
            min="0" max="8" step="1"
            value={value}
            onChange={e => onChange(parseInt(e.target.value))}
            style={{
              position: 'relative', width: '100%',
              appearance: 'none', WebkitAppearance: 'none',
              background: 'transparent',
              height: 44, cursor: 'pointer', margin: 0,
              touchAction: 'manipulation',
            }}
          />
        </div>

        {/* Forward button */}
        <button
          onPointerDown={e => { e.preventDefault(); onChange(Math.min(8, value + 1)) }}
          style={{
            background: value < 8 ? '#0d1a2a' : '#060810',
            border: `1px solid ${value < 8 ? '#2a3a5a' : '#1a2035'}`,
            color: value < 8 ? '#7799bb' : '#1e2a3a',
            width: 44, height: 44, borderRadius: 4,
            fontSize: 18, cursor: value < 8 ? 'pointer' : 'default',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >▶</button>
      </div>

      {/* Hour tap buttons — big touch targets */}
      <div style={{
        display: 'flex', padding: '0 8px 8px', gap: 3,
      }}>
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            onPointerDown={e => { e.preventDefault(); onChange(i) }}
            style={{
              flex: 1, height: 32,
              background: i === value ? '#0d1a2a' : 'transparent',
              border: i === value ? '1px solid #44ddaa' : '1px solid #1a2035',
              borderRadius: 3,
              color: i === value ? '#44ddaa' : '#2a3a4a',
              fontSize: i === value ? 9 : 8,
              fontFamily: FONT, fontWeight: i === value ? 'bold' : 'normal',
              cursor: 'pointer',
              touchAction: 'manipulation',
              transition: 'all 0.1s',
            }}
          >
            {i === 0 ? 'NOW' : `+${i}h`}
          </button>
        ))}
      </div>

      {/* Inline range slider thumb CSS */}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 28px; height: 28px;
          border-radius: 50%;
          background: #44ddaa;
          border: 3px solid #06080f;
          box-shadow: 0 0 8px #44ddaa66;
          cursor: grab;
        }
        input[type=range]::-moz-range-thumb {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: #44ddaa;
          border: 3px solid #06080f;
          box-shadow: 0 0 8px #44ddaa66;
          cursor: grab;
        }
        input[type=range]::-webkit-slider-runnable-track {
          background: transparent; height: 8px;
        }
        input[type=range]:active::-webkit-slider-thumb {
          cursor: grabbing;
        }
      `}</style>
    </div>
  )
}
