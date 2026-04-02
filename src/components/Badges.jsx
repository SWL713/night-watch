const KP_COLORS = {
  G5: '#cc44ff', G4: '#ff3344', G3: '#ff7722', G2: '#ffaa00', G1: '#ffdd33',
}

function kpToG(kp) {
  if (kp === null || kp === undefined) return ''
  if (kp >= 9.0) return 'G5'
  if (kp >= 8.0) return 'G4'
  if (kp >= 7.0) return 'G3'
  if (kp >= 6.0) return 'G2'
  if (kp >= 5.0) return 'G1'
  return ''
}

function gAtHour(selectedHour, kpNow, kpForecast) {
  if (selectedHour === 0) return kpToG(kpNow)
  const target = Date.now() + selectedHour * 3600000
  if (!kpForecast?.length) return ''
  let best = null
  for (const pt of kpForecast) {
    const t = new Date(pt.time).getTime()
    if (t <= target) best = pt
  }
  return best ? kpToG(best.kp) : ''
}

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function Badges({ spaceWeather, selectedHour, helpMode, onHelpTap, children }) {
  const { hss_active, hss_watch, kp_now, kp_forecast } = spaceWeather

  const gLabel = gAtHour(selectedHour ?? 0, kp_now, kp_forecast)
  const gNum   = parseInt(gLabel?.replace('G','')) || 0
  const gColor = KP_COLORS[gLabel] || '#1e2a3a'
  const gText  = gLabel || 'G—'
  const gHeader = gNum > 0 ? 'NOAA scale' : 'NOAA'
  const gFooter = gNum > 0 ? (selectedHour === 0 ? 'active' : `+${selectedHour}h fcst`) : 'quiet'

  // HSS is time-aware: when scrubbing forward, if hss_watch is set and the
  // forecast shows G-level activity at that hour, keep badge lit as WATCH.
  // hss_active = right now. hss_watch = expected within the forecast window.
  const hr = selectedHour ?? 0
  const hssActiveNow  = hss_active
  const hssWatchFuture = hss_watch && hr > 0 && gNum > 0   // watch + G forecast at this hour
  const hssShowActive = hssActiveNow && hr === 0
  const hssShowWatch  = (!hssShowActive) && (hss_watch || hssWatchFuture)

  const hssColor = hssShowActive ? '#ffaa33' : hssShowWatch ? '#cc8822' : '#2a2a3a'
  const hssSub   = hssShowActive ? 'ACTIVE'  : hssShowWatch ? 'WATCH'  : 'inactive'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      position: 'absolute', top: 12, right: 12, zIndex: 1000,
    }}>
      {/* G Badge — square sized to content height ~62px */}
      <div
        onClick={() => helpMode && onHelpTap?.('g_badge')}
        style={{
          background: '#0a0810', border: `2px solid ${gColor}`,
          borderRadius: 2,
          width: 62, height: 62, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace',
          cursor: helpMode ? 'pointer' : 'default',
        }}
      >
        <div style={{ color: gColor + '99', fontSize: 8, letterSpacing: 0.5, lineHeight: 1.2 }}>{gHeader}</div>
        <div style={{ color: gColor, fontSize: 28, fontWeight: 'bold', lineHeight: 1.1 }}>{gText}</div>
        <div style={{ color: gColor + '99', fontSize: 8, letterSpacing: 0.5, lineHeight: 1.2 }}>{gFooter}</div>
      </div>

      {/* HSS Badge — same width as G badge, natural height */}
      <div
        onClick={() => helpMode && onHelpTap?.('hss_badge')}
        style={{
          background: '#080c14', border: `1.5px solid ${hssColor}`,
          borderRadius: 2, padding: '4px 0',
          width: 62, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace',
          cursor: helpMode ? 'pointer' : 'default',
        }}
      >
        <div style={{ color: hssColor, fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>HSS</div>
        <div style={{ color: hssColor + 'cc', fontSize: 9, letterSpacing: 1 }}>{hssSub}</div>
      </div>

      {children}
    </div>
  )
}
