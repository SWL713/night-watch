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
      background: '#06080f', borderTop: '1px solid #1a2035',
      padding: '8px 16px 10px', fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#334455', fontSize: 9, letterSpacing: 1 }}>FORECAST TIME</span>
        <span style={{
          color: value === 0 ? '#ffffff' : '#44ddaa',
          fontSize: 11, fontWeight: 'bold',
        }}>
          {value === 0 ? '▶ NOW' : `+${value}h → ${label(value)} EDT`}
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="8"
        step="1"
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{
          width: '100%', accentColor: '#44ddaa',
          height: 4, cursor: 'pointer',
        }}
      />

      {/* Hour tick labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 2,
      }}>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{
            color: i === value ? '#44ddaa' : '#1e2a3a',
            fontSize: 8, fontFamily: FONT,
            fontWeight: i === value ? 'bold' : 'normal',
          }}>
            {i === 0 ? 'NOW' : `+${i}h`}
          </span>
        ))}
      </div>
    </div>
  )
}
