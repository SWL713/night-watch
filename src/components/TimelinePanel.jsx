import { useMemo } from 'react'
import { getMoonData, isMoonUp } from '../utils/moon.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const BG = '#06080f'
const PANEL_BG = '#070b16'

function formatTime(dt, tz = 'America/New_York') {
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: tz })
}

function formatUTC(dt) {
  return dt.toUTCString().slice(17, 22) + ' UTC'
}

export default function TimelinePanel({ spaceWeather, selectedHour, onHourSelect, moonData }) {
  const now = new Date()

  // Build 9 hour slots: -1hr to +8hr
  const hours = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => {
      const dt = new Date(now.getTime() + (i - 1) * 3600000)
      const moonUp = isMoonUp(dt, moonData)
      const bz = spaceWeather.timeline?.[i]?.bz ?? spaceWeather.bz_now ?? 0
      const bzColor = bz < -5 ? '#ee5577' : bz < 0 ? '#ff8899' : '#44ddaa'
      return { dt, moonUp, bz, bzColor, offset: i - 1 }
    })
  }, [spaceWeather, moonData])

  const { intensity_label, intensity_color, aurora_quality, aurora_quality_color,
          state, enlil_active, enlil_timeline } = spaceWeather

  // Sun times (approximate for NY)
  const sunTimes = useMemo(() => {
    const lat = 40.7128, lon = -74.006
    const now2 = new Date()
    const d = now2.getUTCDate(), mo = now2.getUTCMonth() + 1, yr = now2.getUTCFullYear()
    const n = Math.floor(275*mo/9) - 2*Math.floor((mo+9)/12) + d - 30
    const B = Math.PI*2/360
    const L = 4.869 - 0.0308*n, EL = L + 0.0335*Math.sin(0.9856*n*B + 1.9601)
    const decl = 0.3948 - 23.2559*Math.cos((n+9)*B+0.1326) - 0.3915*Math.cos((2*n+183.1)*B)
                 - 0.1764*Math.cos((3*n+182.6)*B)
    const ha = Math.acos(-Math.tan(lat*B)*Math.tan(decl*B)) * 180/Math.PI
    const noon = 12 - EL/15 - lon/15
    return {
      rise: new Date(now2.setHours(0,0,0,0) + (noon - ha/15)*3600000),
      set:  new Date(now2.valueOf() + (noon + ha/15)*3600000 + 86400000/2),
    }
  }, [])

  const isNight = now > sunTimes.set || now < sunTimes.rise

  return (
    <div style={{
      background: BG, borderBottom: '1px solid #1a2035',
      padding: '10px 12px 0', fontFamily: FONT, color: '#ccd',
      flexShrink: 0,
    }}>
      {/* Top row: moon graphic + status + aurora quality */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        {/* Moon image */}
        <img
          src={`/night-watch/moon/${moonData.phaseIndex}-${moonData.phaseName}.png`}
          alt={moonData.phaseLabel}
          style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          onError={e => e.target.style.display='none'}
        />

        {/* State + intensity */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: stateColor(state), fontSize: 10, letterSpacing: 2, fontWeight: 'bold' }}>
              ● {state || 'QUIET'}
            </span>
            <span style={{ color: '#334455', fontSize: 9 }}>
              {formatUTC(now)} · {formatTime(now)} EDT
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <span style={{ color: intensity_color, fontSize: 14, fontWeight: 'bold' }}>
              {intensity_label}
            </span>
            <span style={{ color: aurora_quality_color, fontSize: 11, fontWeight: 'bold' }}>
              {aurora_quality}
            </span>
            <span style={{ color: '#445566', fontSize: 10 }}>
              Moon {(moonData.illumination * 100).toFixed(0)}% · {moonData.phaseLabel}
            </span>
          </div>
        </div>

        {/* Bz current */}
        <div style={{
          background: '#050810', border: `1px solid ${spaceWeather.bz_now < 0 ? '#ee557766' : '#33ddaa66'}`,
          borderRadius: 2, padding: '4px 10px', textAlign: 'center',
        }}>
          <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1 }}>Bz</div>
          <div style={{
            color: spaceWeather.bz_now < -5 ? '#ee5577' : spaceWeather.bz_now < 0 ? '#ff8899' : '#44ddaa',
            fontSize: 18, fontWeight: 'bold',
          }}>
            {spaceWeather.bz_now != null ? (spaceWeather.bz_now > 0 ? '+' : '') + spaceWeather.bz_now.toFixed(1) : '—'}
          </div>
          <div style={{ color: '#334455', fontSize: 8 }}>nT</div>
        </div>
      </div>

      {/* Hour-by-hour timeline */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 8 }}>
        {hours.map((h, i) => {
          const isSelected = h.offset === selectedHour
          const isNow2 = h.offset === 0
          const bzH = h.bz

          return (
            <div
              key={i}
              onClick={() => onHourSelect(h.offset)}
              style={{
                flex: '0 0 auto', width: 68, cursor: 'pointer',
                background: isSelected ? '#0d1a2a' : isNow2 ? '#0a1020' : PANEL_BG,
                border: isSelected ? '1px solid #ff4444' : isNow2 ? '1px solid #ffffff44' : '1px solid #1a2035',
                borderRadius: 2, padding: '6px 4px', textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              {/* Time label */}
              <div style={{ color: isNow2 ? '#ffffff' : '#445566', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                {isNow2 ? 'NOW' : formatTime(h.dt)}
              </div>

              {/* Bz bar */}
              <div style={{ height: 28, position: 'relative', margin: '0 4px' }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#1a2035' }} />
                {bzH !== null && (
                  <div style={{
                    position: 'absolute',
                    left: 0, right: 0,
                    background: bzH < 0 ? '#ee5577' : '#44ddaa',
                    opacity: 0.85,
                    bottom: bzH < 0 ? '50%' : undefined,
                    top: bzH >= 0 ? '50%' : undefined,
                    height: `${Math.min(50, Math.abs(bzH) * 2.5)}%`,
                    borderRadius: 1,
                  }} />
                )}
              </div>

              {/* Bz value */}
              <div style={{ color: h.bzColor, fontSize: 9, fontWeight: 'bold', margin: '2px 0' }}>
                {bzH != null ? (bzH > 0 ? '+' : '') + bzH.toFixed(1) : '—'}
              </div>

              {/* Moon indicator */}
              <div style={{ fontSize: 9, color: h.moonUp ? '#aabbcc' : '#1e2a3a' }}>
                {h.moonUp ? '☽' : '·'}
              </div>

              {/* Day/night */}
              <div style={{
                height: 3, borderRadius: 1, marginTop: 3,
                background: isNight ? '#0d1a3a' : '#4a3a08',
              }} />
            </div>
          )
        })}
      </div>

      {/* ENLIL strip — only when active */}
      {enlil_active && enlil_timeline && enlil_timeline.length > 0 && (
        <div style={{
          borderTop: '1px solid #1a2035', paddingTop: 6, marginBottom: 4,
          display: 'flex', gap: 4, overflowX: 'auto',
        }}>
          <span style={{ color: '#cc8800', fontSize: 9, letterSpacing: 1, flexShrink: 0, paddingTop: 2 }}>
            ENLIL ↓
          </span>
          {enlil_timeline.map((pt, i) => (
            <div key={i} style={{
              flex: '0 0 auto', width: 68, textAlign: 'center',
              background: PANEL_BG, border: '1px solid #1a2035', borderRadius: 2, padding: '3px 2px',
            }}>
              <div style={{ color: '#cc8800', fontSize: 8 }}>
                {pt.speed ? `${Math.round(pt.speed)}km/s` : '—'}
              </div>
              <div style={{ color: '#7799aa', fontSize: 8 }}>
                {pt.density ? `${pt.density.toFixed(1)}n/cc` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function stateColor(state) {
  const map = {
    QUIET: '#6677aa', WATCH: '#2d9e55', INBOUND: '#cc8800',
    IMMINENT: '#dd5500', ARRIVED: '#cc1133', STORM_ACTIVE: '#991122',
    SUBSIDING: '#9977cc',
  }
  return map[state] || '#6677aa'
}
