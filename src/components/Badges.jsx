export default function Badges({ spaceWeather }) {
  const { g_level, g_label, hss_active, hss_watch, state } = spaceWeather

  const gNum = parseInt(g_label?.replace('G','')) || 0
  const gColor = gNum >= 5 ? '#cc44ff' : gNum === 4 ? '#ff3344' : gNum === 3 ? '#ff7722'
              : gNum === 2 ? '#ffaa00' : gNum >= 1 ? '#ffdd33' : '#1e2a3a'
  const gText = g_label || 'G—'
  const gHeader = g_level ? 'NOAA alert' : 'NOAA'
  const gFooter = g_level ? 'active' : 'quiet'

  const hssColor = hss_active ? '#ffaa33' : hss_watch ? '#cc8822' : '#2a2a3a'
  const hssSub   = hss_active ? 'ACTIVE'  : hss_watch ? 'WATCH'  : 'inactive'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      position: 'absolute', top: 12, right: 12, zIndex: 1000,
    }}>
      {/* G Badge */}
      <div style={{
        background: '#0a0810', border: `2px solid ${gColor}`,
        borderRadius: 2, padding: '6px 10px', minWidth: 72,
        textAlign: 'center', fontFamily: 'monospace',
      }}>
        <div style={{ color: gColor + '99', fontSize: 9, letterSpacing: 1 }}>{gHeader}</div>
        <div style={{ color: gColor, fontSize: 26, fontWeight: 'bold', lineHeight: 1.1 }}>{gText}</div>
        <div style={{ color: gColor + '99', fontSize: 9, letterSpacing: 1 }}>{gFooter}</div>
      </div>

      {/* HSS Badge */}
      <div style={{
        background: '#080c14', border: `1.5px solid ${hssColor}`,
        borderRadius: 2, padding: '4px 10px', minWidth: 72,
        textAlign: 'center', fontFamily: 'monospace',
      }}>
        <div style={{ color: hssColor, fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>HSS</div>
        <div style={{ color: hssColor + 'cc', fontSize: 9, letterSpacing: 1 }}>{hssSub}</div>
      </div>
    </div>
  )
}
