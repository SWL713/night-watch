import { useMemo } from 'react'
import { getMoonData, moonInterference } from '../utils/moon.js'
import TimelineBar from './TimelineBar.jsx'
import { useBzTrace } from '../hooks/useBzTrace.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const BASE = '/night-watch'

const AURORA_MAP = {
  'Calm':'1-calm.png','Weak':'2-weak.png','Mild':'3-mild.png',
  'Moderate':'4-moderate.png','Strong':'5-strong.png',
  'Very Strong':'6-very_strong.png','Extreme':'7-extreme.png',
}
const MOON_MAP = {
  'New Moon':'1-new.png','Waxing Crescent':'2-waxing_crescent.png',
  'First Quarter':'3-first_quarter.png','Waxing Gibbous':'4-waxing_gibbous.png',
  'Full Moon':'5-full.png','Waning Gibbous':'6-waning_gibbous.png',
  'Last Quarter':'7-last_quarter.png','Waning Crescent':'8-waning_crescent.png',
}
const QUALITY_COLOR = {
  'EXCELLENT':'#00ffff','GOOD':'#00ff00','FAIR':'#ffd700','POOR':'#ff4444',
}
const INTENSITY_COLOR = {
  'Calm':'#aaaaaa','Weak':'#ff4444','Mild':'#ff8800','Moderate':'#ffd700',
  'Strong':'#88cc44','Very Strong':'#44ff44','Extreme':'#ff44ff',
}

function formatTime(dt) {
  return dt.toLocaleTimeString('en-US', {
    hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/New_York',
  })
}
function formatUTC(dt) { return dt.toUTCString().slice(17,22) + ' UTC' }
function stateColor(state) {
  return ({ QUIET:'#6677aa',WATCH:'#2d9e55',INBOUND:'#cc8800',
    IMMINENT:'#dd5500',ARRIVED:'#cc1133',STORM_ACTIVE:'#991122',
    SUBSIDING:'#9977cc' })[state] || '#6677aa'
}

function StatRow({ icon, label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
      <img src={icon} alt="" style={{ width:16, height:16, objectFit:'contain', flexShrink:0 }} />
      <span style={{ color:'#445566', fontSize:9, letterSpacing:1, width:74, flexShrink:0 }}>{label}</span>
      <span style={{ color, fontSize:11, fontWeight:'bold' }}>{value}</span>
    </div>
  )
}

// Compute sun times for a given date (same CME Watch algo used in TimelineBar)
function sunTimesForDate(date) {
  const NY_LAT = 40.7128, NY_LON = -74.006
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const doy   = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000)
  const B     = (Math.PI * 2 / 365) * (doy - 81)
  const eot   = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B)
  const decl  = Math.asin(Math.sin(Math.PI*2/365*(doy-81)) * Math.sin(23.45*Math.PI/180))
  const latR  = NY_LAT * Math.PI / 180
  let cosHA   = (Math.sin(-0.833*Math.PI/180) - Math.sin(latR)*Math.sin(decl)) / (Math.cos(latR)*Math.cos(decl))
  cosHA       = Math.max(-1, Math.min(1, cosHA))
  const ha    = Math.acos(cosHA) * 180 / Math.PI
  const noonMin = 720 - 4*NY_LON - eot
  const base  = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    rise: new Date(base + (noonMin - ha*4) * 60000),
    set:  new Date(base + (noonMin + ha*4) * 60000),
  }
}

// Astronomical darkness % — pure sun depression, 0 at sunrise/set, 100 at −18°
// 90-min taper covers civil + nautical + astronomical twilight combined
// Moon is handled separately as interference
function computeAstroDark(t) {
  const TAPER = 90 * 60000
  const tm    = t.getTime()

  // Check yesterday→today window (handles post-midnight before sunrise)
  // and today→tomorrow window (handles post-sunset before midnight)
  for (const offset of [-86400000, 0]) {
    const sunA = sunTimesForDate(new Date(tm + offset))
    const sunB = sunTimesForDate(new Date(tm + offset + 86400000))
    const ss = sunA.set.getTime()
    const sr = sunB.rise.getTime()
    if (tm > ss && tm < sr) {
      // We are in the night between sunA.set and sunB.rise
      if (tm < ss + TAPER) return Math.round((tm - ss) / TAPER * 100)  // evening taper
      if (tm > sr - TAPER) return Math.round((sr - tm) / TAPER * 100)  // morning taper
      return 100                                                          // full darkness
    }
  }
  return 0  // daytime
}

// Derive intensity from Bz at a given timeline offset
function bzToIntensity(bz) {
  const ey = (bz || 0) * 4.5 / 100 * -100  // simplified — just use Bz sign/magnitude
  const bins = [
    [0,'Calm'],[- 25,'Weak'],[-55,'Mild'],[-95,'Moderate'],
    [-145,'Strong'],[-200,'Very Strong'],[-1e9,'Extreme'],
  ]
  const val = (bz || 0) * 4.5  // rough Ey proxy
  for (const [thresh, label] of bins) {
    if (val >= thresh) return label
  }
  return 'Calm'
}

export default function TimelinePanel({ spaceWeather, selectedHour, onHourSelect, moonData, helpMode, onHelpTap }) {
  const now = new Date()

  const { state, bz_now, intensity_label, aurora_quality, aurora_quality_color,
    enlil_active, enlil_timeline, timeline,
  } = spaceWeather

  const { trace: bzTrace, plasmaTrace } = useBzTrace()

  // ── Issue 3: derive stats for the SELECTED hour ────────────────────────────
  const selectedTime = new Date(now.getTime() + selectedHour * 3600000)
  const isNow        = selectedHour === 0

  // Bz at selected hour from timeline
  const tlPoint  = timeline?.find(p => p?.offset === selectedHour)
  const bzAtHour = isNow
    ? (bzTrace.length ? bzTrace[bzTrace.length-1].bz : bz_now)
    : (tlPoint?.bz ?? bz_now)

  // Intensity at selected hour
  const intensityAtHour = isNow ? intensity_label : bzToIntensity(bzAtHour)

  // Astro dark at selected hour
  const astroDarkAtHour = useMemo(() => computeAstroDark(selectedTime),
    [selectedHour])

  // Moon interference at selected hour — illumination × altitude factor, 0 when moon is down
  const moonIllumAtHour = useMemo(() => moonInterference(selectedTime, moonData),
    [selectedHour, moonData])

  // Quality at selected hour
  const qualityAtHour = useMemo(() => {
    if (astroDarkAtHour < 10) return { label: 'POOR', color: '#ff4444' }
    const iRank = { 'Calm':0,'Weak':1,'Mild':2,'Moderate':3,'Strong':4,'Very Strong':5,'Extreme':6 }
    const rank  = iRank[intensityAtHour] ?? 0
    if (rank === 0 && astroDarkAtHour < 60) return { label: 'POOR',      color: '#ff4444' }
    if (rank <= 1 && astroDarkAtHour < 60) return { label: 'POOR',      color: '#ff4444' }
    if (rank <= 2 && astroDarkAtHour < 50) return { label: 'FAIR',      color: '#ffcc44' }
    if (rank === 0)                         return { label: 'POOR',      color: '#ff4444' }
    if (rank === 1)                         return { label: 'FAIR',      color: '#ffcc44' }
    if (rank === 2)                         return { label: 'FAIR',      color: '#ffcc44' }
    if (rank === 3 && astroDarkAtHour >= 50) return { label: 'GOOD',    color: '#44cc88' }
    if (rank >= 4 && astroDarkAtHour >= 40)  return { label: 'EXCELLENT',color: '#44ffcc' }
    return { label: 'FAIR', color: '#ffcc44' }
  }, [intensityAtHour, astroDarkAtHour])

  const intensityColor = INTENSITY_COLOR[intensityAtHour] || '#aaaaaa'
  const qualityColor   = qualityAtHour.color
  const qualityLabel   = qualityAtHour.label
  const auroraImg      = `${BASE}/aurora/${AURORA_MAP[intensityAtHour] || '1-calm.png'}`
  const moonImg        = `${BASE}/moon/${MOON_MAP[moonData.phaseLabel] || '1-new.png'}`
  const moonIllumPct   = Math.round((moonData.illumination || 0) * 100)

  const displayTime = isNow ? now : selectedTime
  const timeLabel   = isNow
    ? `${formatUTC(now)} · ${formatTime(now)} EDT`
    : `+${selectedHour}h · ${formatUTC(displayTime)} · ${formatTime(displayTime)} EDT`

  return (
    <div style={{
      background:'#06080f', borderBottom:'1px solid #1a2035',
      fontFamily:FONT, color:'#ccd', flexShrink:0,
    }}>
      <div style={{ display:'flex', height:110 }}>

        {/* Logo */}
        <div style={{
          width:110, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'8px 4px', borderRight:'1px solid #1a2035',
        }}>
          <a href="https://www.facebook.com/share/g/1CUrP5oFuy/" target="_blank" rel="noopener">
            <img src={`${BASE}/logo.jpg`} alt="Substorm Society"
              style={{ width:90, height:90, objectFit:'contain', borderRadius:4, cursor:'pointer' }} />
          </a>
        </div>

        {/* Aurora image */}
        <div
          style={{ flex:1, position:'relative', overflow:'hidden', minWidth:0, cursor: helpMode ? 'pointer' : 'default' }}
          onClick={() => helpMode && onHelpTap?.('aurora_image')}
        >
          <img src={auroraImg} alt={intensityAtHour} style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', objectPosition:'center bottom', opacity:0.85,
          }} />
          <div style={{
            position:'absolute', inset:0,
            background:'linear-gradient(to bottom, rgba(6,8,15,0.55) 0%, rgba(6,8,15,0.15) 60%, rgba(6,8,15,0.5) 100%)',
          }} />
          <img
            src={moonImg} alt={moonData.phaseLabel}
            onClick={e => { if (helpMode) { e.stopPropagation(); onHelpTap?.('moon_image') } }}
            style={{
              position:'absolute', top:6, right:6, width:60, height:60,
              objectFit:'contain', borderRadius:'50%',
              filter:'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
              cursor: helpMode ? 'pointer' : 'default',
            }}
          />

          <div style={{
            position:'absolute', top:8, left:8,
            color:'#445566', fontSize:9, letterSpacing:1,
          }}>
            {timeLabel}
          </div>

          <div
            style={{ position:'absolute', bottom:8, left:8, cursor: helpMode ? 'pointer' : 'default' }}
            onClick={e => { if (helpMode) { e.stopPropagation(); onHelpTap?.('bz_readout') } }}
          >
            <div style={{ color:'#334455', fontSize:8, letterSpacing:1 }}>Bz</div>
            <div style={{
              color: bzAtHour < -5 ? '#ee5577' : bzAtHour < 0 ? '#ff8899' : '#44ddaa',
              fontSize:22, fontWeight:'bold', lineHeight:1,
            }}>
              {bzAtHour != null ? (bzAtHour > 0 ? '+' : '') + bzAtHour.toFixed(1) : '—'}
              <span style={{ fontSize:10, color:'#334455' }}> nT</span>
            </div>
          </div>
        </div>

        {/* Chase quality panel — single tappable box on mobile */}
        <div
          onClick={() => helpMode && onHelpTap?.('chase_quality')}
          style={{
            width:175, flexShrink:0, padding:'5px 10px',
            borderLeft:'1px solid #1a2035',
            display:'flex', flexDirection:'column', justifyContent:'center',
            cursor: helpMode ? 'pointer' : 'default',
          }}
        >
          <div style={{ marginBottom:4 }}>
            <div style={{ color:'#2a3a55', fontSize:7, letterSpacing:1, marginBottom:1 }}>
              CHASE QUALITY{!isNow ? ` · +${selectedHour}h` : ''}
            </div>
            <div style={{ color:qualityColor, fontSize:16, fontWeight:'bold', letterSpacing:2 }}>
              {qualityLabel}
            </div>
          </div>

          <StatRow icon={`${BASE}/icons/fire_icon.png`} label="Intensity" value={intensityAtHour || 'Calm'} color={intensityColor} />
          <StatRow icon={`${BASE}/icons/moon_icon.png`} label="Interference" value={`${moonIllumAtHour}%`} color={moonIllumAtHour < 25 ? '#44cc88' : moonIllumAtHour < 60 ? '#ffcc44' : '#ff5566'} />
          <StatRow icon={`${BASE}/icons/sun_icon.png`} label="Astro Dark" value={`${astroDarkAtHour}%`} color={astroDarkAtHour > 75 ? '#44cc88' : astroDarkAtHour > 40 ? '#ffcc44' : '#ff5566'} />
          <div style={{ marginTop:3, color:'#334455', fontSize:8 }}>
            {moonData.phaseLabel} · {moonIllumPct}% illuminated
          </div>
        </div>
      </div>

      <TimelineBar
        spaceWeather={spaceWeather}
        moonData={moonData}
        selectedHour={selectedHour}
        onHourSelect={onHourSelect}
        bzTrace={bzTrace}
        plasmaTrace={plasmaTrace}
        helpMode={helpMode}
        onHelpTap={onHelpTap}
      />
    </div>
  )
}
