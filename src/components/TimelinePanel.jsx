import { getMoonData } from '../utils/moon.js'
import TimelineBar from './TimelineBar.jsx'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const BASE = '/night-watch'

// Aurora image per intensity — matches Borealis Buddy naming
const AURORA_MAP = {
  'Calm':        '1-calm.png',
  'Weak':        '2-weak.png',
  'Mild':        '3-mild.png',
  'Moderate':    '4-moderate.png',
  'Strong':      '5-strong.png',
  'Very Strong': '6-very_strong.png',
  'Extreme':     '7-extreme.png',
}

// Moon phase image
const MOON_MAP = {
  'New Moon':        '1-new.png',
  'Waxing Crescent': '2-waxing_crescent.png',
  'First Quarter':   '3-first_quarter.png',
  'Waxing Gibbous':  '4-waxing_gibbous.png',
  'Full Moon':       '5-full.png',
  'Waning Gibbous':  '6-waning_gibbous.png',
  'Last Quarter':    '7-last_quarter.png',
  'Waning Crescent': '8-waning_crescent.png',
}

// Chase quality colors — matching Borealis Buddy
const QUALITY_COLOR = {
  'EXCELLENT': '#00ffff',
  'GOOD':      '#00ff00',
  'FAIR':      '#ffd700',
  'POOR':      '#ff4444',
}

// Intensity colors
const INTENSITY_COLOR = {
  'Calm':        '#aaaaaa',
  'Weak':        '#ff4444',
  'Mild':        '#ff8800',
  'Moderate':    '#ffd700',
  'Strong':      '#88cc44',
  'Very Strong': '#44ff44',
  'Extreme':     '#ff44ff',
}

function formatTime(dt) {
  return dt.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/New_York',
  })
}

function formatUTC(dt) {
  return dt.toUTCString().slice(17, 22) + ' UTC'
}

function stateColor(state) {
  const map = {
    QUIET: '#6677aa', WATCH: '#2d9e55', INBOUND: '#cc8800',
    IMMINENT: '#dd5500', ARRIVED: '#cc1133', STORM_ACTIVE: '#991122',
    SUBSIDING: '#9977cc',
  }
  return map[state] || '#6677aa'
}

// Stat row with icon, label, value — Borealis Buddy style
function StatRow({ icon, label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <img src={icon} alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
      <span style={{ color: '#445566', fontSize: 9, letterSpacing: 1, width: 74, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color, fontSize: 11, fontWeight: 'bold' }}>{value}</span>
    </div>
  )
}

export default function TimelinePanel({ spaceWeather, selectedHour, onHourSelect, moonData }) {
  const now = new Date()

  const {
    state, bz_now, intensity_label, aurora_quality, aurora_quality_color,
    enlil_active, enlil_timeline, timeline,
  } = spaceWeather

  // Derived values
  const intensityColor = INTENSITY_COLOR[intensity_label] || '#aaaaaa'
  const qualityColor   = QUALITY_COLOR[aurora_quality] || aurora_quality_color || '#ff4444'
  const auroraImg      = `${BASE}/aurora/${AURORA_MAP[intensity_label] || '1-calm.png'}`
  const moonImg        = `${BASE}/moon/${MOON_MAP[moonData.phaseLabel] || '1-new.png'}`

  const moonIllumPct  = Math.round((moonData.illumination || 0) * 100)
  const interferencePct = Math.round(spaceWeather.interference_pct ?? 0)
  const astroDarkPct    = Math.round(spaceWeather.astro_dark_pct ?? 100)

  return (
    <div style={{
      background: '#06080f',
      borderBottom: '1px solid #1a2035',
      fontFamily: FONT,
      color: '#ccd',
      flexShrink: 0,
    }}>
      {/* ── TOP ROW: Logo | Aurora+Moon composite | Chase Quality stats ── */}
      <div style={{ display: 'flex', height: 130 }}>

        {/* LEFT — Substorm Society logo */}
        <div style={{
          width: 110, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 4px',
          borderRight: '1px solid #1a2035',
        }}>
          <img
            src={`${BASE}/logo.jpg`}
            alt="Substorm Society"
            style={{ width: 90, height: 90, objectFit: 'contain' }}
          />
        </div>

        {/* CENTRE — Aurora image with moon overlay + state/Bz */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          {/* Aurora background image */}
          <img
            src={auroraImg}
            alt={intensity_label}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center bottom',
              opacity: 0.85,
            }}
          />

          {/* Dark gradient overlay so text is readable */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(6,8,15,0.55) 0%, rgba(6,8,15,0.15) 60%, rgba(6,8,15,0.5) 100%)',
          }} />

          {/* Moon image — top right of aurora composite, same as Borealis Buddy */}
          <img
            src={moonImg}
            alt={moonData.phaseLabel}
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 60, height: 60,
              objectFit: 'contain',
              borderRadius: '50%',
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
            }}
          />

          {/* State badge top left */}
          <div style={{
            position: 'absolute', top: 8, left: 8,
            color: stateColor(state), fontSize: 10,
            fontWeight: 'bold', letterSpacing: 2,
          }}>
            ● {state || 'QUIET'}
          </div>

          {/* UTC time */}
          <div style={{
            position: 'absolute', top: 26, left: 8,
            color: '#445566', fontSize: 9, letterSpacing: 1,
          }}>
            {formatUTC(now)} · {formatTime(now)} EDT
          </div>

          {/* Bz readout bottom left */}
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
          }}>
            <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1 }}>Bz</div>
            <div style={{
              color: bz_now < -5 ? '#ee5577' : bz_now < 0 ? '#ff8899' : '#44ddaa',
              fontSize: 22, fontWeight: 'bold', lineHeight: 1,
            }}>
              {bz_now != null ? (bz_now > 0 ? '+' : '') + bz_now.toFixed(1) : '—'}
              <span style={{ fontSize: 10, color: '#334455' }}> nT</span>
            </div>
          </div>
        </div>

        {/* RIGHT — Chase quality stats panel, Borealis Buddy style */}
        <div style={{
          width: 200, flexShrink: 0,
          padding: '10px 12px',
          borderLeft: '1px solid #1a2035',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          {/* Chase quality verdict */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#2a3a55', fontSize: 8, letterSpacing: 1, marginBottom: 2 }}>
              CHASE QUALITY
            </div>
            <div style={{ color: qualityColor, fontSize: 18, fontWeight: 'bold', letterSpacing: 2 }}>
              {aurora_quality || 'POOR'}
            </div>
          </div>

          {/* Three stat rows with icons */}
          <StatRow
            icon={`${BASE}/icons/fire_icon.png`}
            label="Intensity"
            value={intensity_label || 'Calm'}
            color={intensityColor}
          />
          <StatRow
            icon={`${BASE}/icons/moon_icon.png`}
            label="Interference"
            value={`${interferencePct}%`}
            color={interferencePct < 25 ? '#44cc88' : interferencePct < 60 ? '#ffcc44' : '#ff5566'}
          />
          <StatRow
            icon={`${BASE}/icons/sun_icon.png`}
            label="Astro Dark"
            value={`${astroDarkPct}%`}
            color={astroDarkPct > 75 ? '#44cc88' : astroDarkPct > 40 ? '#ffcc44' : '#ff5566'}
          />

          {/* Moon info */}
          <div style={{ marginTop: 6, color: '#334455', fontSize: 8 }}>
            {moonData.phaseLabel} · {moonIllumPct}% illuminated
          </div>
        </div>
      </div>

      {/* ── CME Watch-style timeline bar ── */}
      <TimelineBar
        spaceWeather={spaceWeather}
        moonData={moonData}
        selectedHour={selectedHour}
        onHourSelect={onHourSelect}
      />

      {/* ── ENLIL strip — conditional ── */}
      {enlil_active && enlil_timeline?.length > 0 && (
        <div style={{
          borderTop: '1px solid #1a2035', padding: '4px 8px 6px',
          display: 'flex', gap: 4, overflowX: 'auto',
        }}>
          <span style={{ color: '#cc8800', fontSize: 9, letterSpacing: 1, flexShrink: 0, paddingTop: 2 }}>
            ENLIL ↓
          </span>
          {enlil_timeline.map((pt, i) => (
            <div key={i} style={{
              flex: '0 0 auto', width: 70, textAlign: 'center',
              background: '#070b16', border: '1px solid #1a2035',
              borderRadius: 2, padding: '3px 2px',
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
