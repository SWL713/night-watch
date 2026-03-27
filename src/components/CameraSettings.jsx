import { useState, useEffect } from 'react'
import { calculateCameraSettings, getTroubleshootingFix } from '../utils/cameraEngine.js'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js'
const supabaseReady = !SUPABASE_URL.startsWith('REPLACE_ME')
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const INTENSITIES = ['Calm', 'Weak', 'Mild', 'Moderate', 'Strong', 'Very Strong', 'Extreme']

const INTENSITY_COLORS = {
  'Calm': '#445566', 'Weak': '#557788', 'Mild': '#44aaaa',
  'Moderate': '#44cc88', 'Strong': '#ffcc44', 'Very Strong': '#ff8844', 'Extreme': '#ff4444',
}

const TROUBLESHOOT_OPTIONS = [
  { id: 'too_dark',             label: 'Photo too dark' },
  { id: 'too_bright',           label: 'Photo too bright / washed out' },
  { id: 'grainy',               label: 'Photo grainy / noisy' },
  { id: 'aurora_smear',         label: 'Aurora smeared — no detail' },
  { id: 'everything_blurry',    label: 'Everything blurry' },
  { id: 'stars_trailing',       label: 'Stars trailing / streaky' },
  { id: 'aurora_blurry_stars_sharp', label: 'Aurora blurry but stars sharp' },
  { id: 'focus_soft',           label: 'Focus looks soft / hazy' },
]

const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '5px 8px', fontSize: 10,
  fontFamily: FONT, outline: 'none', borderRadius: 2,
  width: '100%', boxSizing: 'border-box',
}

const selectStyle = { ...inputStyle }

function Label({ children }) {
  return <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>{children}</div>
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', borderBottom: '1px solid #0d1525' }}>
      <span style={{ color: '#445566', fontSize: 9, fontFamily: FONT }}>{label}</span>
      <span style={{ color: color || '#aabbcc', fontSize: 10, fontFamily: FONT, fontWeight: 'bold' }}>{value}</span>
    </div>
  )
}

export default function CameraSettings({ onClose, locationData, spaceWeather }) {
  // ── State ────────────────────────────────────────────────────────────────
  const [step, setStep]             = useState('device')   // device | details | results | troubleshoot
  const [deviceType, setDeviceType] = useState(null)

  // Phone state
  const [profiles, setProfiles]   = useState([])
  const [make, setMake]           = useState('')
  const [selectedProfile, setSelectedProfile] = useState(null)

  // DSLR state
  const [sensorSize, setSensorSize] = useState('full_frame')
  const [focalLength, setFocalLength] = useState(24)
  const [maxAperture, setMaxAperture] = useState(2.8)

  // Support
  const [hasTripod, setHasTripod]         = useState(true)
  const [hasStarTracker, setHasStarTracker] = useState(false)

  // Conditions
  const [intensity, setIntensity]         = useState(spaceWeather?.intensity || 'Weak')
  const [overrideConditions, setOverride] = useState(false)
  const [moonUp]   = useState(locationData?.moonUp ?? false)
  const [moonIllum] = useState(locationData?.moonIllum ?? 0)
  const [bortle]   = useState(locationData?.bortle ?? 5)
  const [latitude] = useState(locationData?.lat ?? 44)

  // Results
  const [result, setResult] = useState(null)

  // Troubleshoot
  const [selectedProblems, setSelectedProblems] = useState([])
  const [troubleshootResults, setTroubleshootResults] = useState([])

  // ── Load phone profiles ──────────────────────────────────────────────────
  useEffect(() => {
    if (!supabaseReady) return
    supabase.from('camera_profiles')
      .select('*')
      .order('make').order('model')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const makes = [...new Set(profiles.filter(p => p.device_type === deviceType).map(p => p.make))]
  const models = profiles.filter(p => p.device_type === deviceType && p.make === make)

  // ── Calculate ────────────────────────────────────────────────────────────
  function handleCalculate() {
    const r = calculateCameraSettings({
      deviceType,
      profile: selectedProfile,
      sensorSize,
      focalLength: parseInt(focalLength),
      maxAperture: parseFloat(maxAperture),
      hasTripod,
      hasStarTracker,
      intensity,
      moonUp,
      moonIllumination: moonIllum,
      bortle,
      latitude,
    })
    setResult(r)
    setStep('results')
  }

  // ── Troubleshoot ─────────────────────────────────────────────────────────
  function handleTroubleshoot() {
    const fixes = selectedProblems
      .map(id => getTroubleshootingFix(id, result?.baseInputs
        ? { ...result.baseInputs, shutterRaw: result.shutterRaw,
            calculatedNPF: result.calculatedNPF, motionLimit: result.motionLimit }
        : {}))
      .filter(Boolean)
    setTroubleshootResults(fixes)
    setStep('troubleshoot')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', top: 56, left: 12, zIndex: 2000,
      background: '#070b16', border: '1px solid #1a3a2a',
      borderRadius: 4, width: 310, maxHeight: '80vh',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 24px rgba(0,0,0,0.8)', fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 12px', borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
        <div style={{ color: '#44ddaa', fontSize: 11, letterSpacing: 2 }}>📷 CAMERA ADVISOR</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Location context */}
      {locationData && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #0d1525',
          color: '#334455', fontSize: 8, flexShrink: 0 }}>
          📍 {locationData.lat?.toFixed(4)}, {locationData.lon?.toFixed(4)}
          {bortle ? ` · Bortle ${bortle}` : ''}
          {locationData.mlat ? ` · MLat ${locationData.mlat?.toFixed(1)}°` : ''}
        </div>
      )}

      {/* Scrollable body */}
      <div style={{ overflowY: 'auto', padding: '12px', flex: 1 }}>

        {/* ── STEP 1: Device selection ── */}
        {step === 'device' && (
          <div>
            <div style={{ color: '#aabbcc', fontSize: 10, marginBottom: 12 }}>
              What are you shooting with?
            </div>
            {[
              { id: 'iphone',  label: '📱 iPhone' },
              { id: 'android', label: '📱 Android' },
              { id: 'dslr',    label: '📷 DSLR / Mirrorless' },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => { setDeviceType(id); setStep('details') }}
                style={{ display: 'block', width: '100%', marginBottom: 6, padding: '8px 12px',
                  background: '#060810', border: '1px solid #1a3a2a',
                  color: '#44ddaa', fontSize: 10, fontFamily: FONT,
                  cursor: 'pointer', borderRadius: 2, textAlign: 'left', letterSpacing: 1 }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2: Device details ── */}
        {step === 'details' && (
          <div>
            <button onClick={() => setStep('device')} style={{ background: 'none', border: 'none',
              color: '#445566', fontSize: 9, cursor: 'pointer', marginBottom: 10, fontFamily: FONT }}>
              ← back
            </button>

            {/* Phone inputs */}
            {(deviceType === 'iphone' || deviceType === 'android') && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Label>MANUFACTURER</Label>
                  <select style={selectStyle} value={make} onChange={e => { setMake(e.target.value); setSelectedProfile(null) }}>
                    <option value="">Select...</option>
                    {makes.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {make && (
                  <div style={{ marginBottom: 8 }}>
                    <Label>MODEL</Label>
                    <select style={selectStyle} value={selectedProfile?.id || ''}
                      onChange={e => setSelectedProfile(models.find(m => m.id === parseInt(e.target.value)) || null)}>
                      <option value="">Select...</option>
                      {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
                    </select>
                  </div>
                )}
                {selectedProfile && (
                  <div style={{ background: '#060810', border: '1px solid #1a2a3a',
                    borderRadius: 2, padding: '6px 8px', marginBottom: 8, fontSize: 8, color: '#334455' }}>
                    f/{selectedProfile.aperture} · {selectedProfile.sensor_size}
                    {selectedProfile.has_proraw && ' · ProRAW ✓'}
                    {selectedProfile.has_night_mode && ' · Night Mode ✓'}
                  </div>
                )}
              </div>
            )}

            {/* DSLR inputs */}
            {deviceType === 'dslr' && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Label>SENSOR SIZE</Label>
                  <select style={selectStyle} value={sensorSize} onChange={e => setSensorSize(e.target.value)}>
                    <option value="full_frame">Full Frame (35mm)</option>
                    <option value="apsc">APS-C (Crop)</option>
                    <option value="mft">Micro Four Thirds</option>
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Label>FOCAL LENGTH (mm)</Label>
                  <input type="number" style={inputStyle} value={focalLength} min={10} max={35}
                    onChange={e => setFocalLength(e.target.value)} placeholder="e.g. 24" />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Label>MAX (WIDEST) APERTURE</Label>
                  <select style={selectStyle} value={maxAperture} onChange={e => setMaxAperture(e.target.value)}>
                    {[1.2, 1.4, 1.8, 2.0, 2.8, 3.5, 4.0].map(f =>
                      <option key={f} value={f}>f/{f}</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Support */}
            <div style={{ marginBottom: 12 }}>
              <Label>SUPPORT</Label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                color: '#aabbcc', fontSize: 9, cursor: 'pointer' }}>
                <input type="checkbox" checked={hasTripod} onChange={e => setHasTripod(e.target.checked)} />
                Using a tripod / stable surface
              </label>
              {deviceType === 'dslr' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6,
                  color: '#aabbcc', fontSize: 9, cursor: 'pointer' }}>
                  <input type="checkbox" checked={hasStarTracker} onChange={e => setHasStarTracker(e.target.checked)} />
                  Star tracker mounted
                </label>
              )}
            </div>

            {/* Conditions */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Label>AURORA CONDITIONS</Label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4,
                  color: '#334455', fontSize: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={overrideConditions}
                    onChange={e => setOverride(e.target.checked)} />
                  override
                </label>
              </div>
              {!overrideConditions ? (
                <div style={{ background: '#060810', border: '1px solid #1a2a3a',
                  borderRadius: 2, padding: '5px 8px', fontSize: 9,
                  color: INTENSITY_COLORS[intensity] || '#aabbcc' }}>
                  {intensity} (from live conditions)
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {INTENSITIES.map(i => (
                    <button key={i} onClick={() => setIntensity(i)} style={{
                      padding: '3px 6px', fontSize: 8, fontFamily: FONT, borderRadius: 2,
                      cursor: 'pointer', letterSpacing: 0.5,
                      background: intensity === i ? '#0d2a1a' : '#060810',
                      border: `1px solid ${intensity === i ? (INTENSITY_COLORS[i] || '#44ddaa') : '#1a2a3a'}`,
                      color: intensity === i ? (INTENSITY_COLORS[i] || '#44ddaa') : '#445566',
                    }}>{i}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Conditions summary */}
            <div style={{ background: '#060810', border: '1px solid #0d1525',
              borderRadius: 2, padding: '6px 8px', marginBottom: 12,
              display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Bortle', value: bortle },
                { label: 'Moon', value: moonUp ? `Up · ${moonIllum}%` : 'Down' },
                { label: 'Latitude', value: `${latitude?.toFixed(1)}°` },
              ].map(({ label, value }) => (
                <div key={label} style={{ fontSize: 8 }}>
                  <span style={{ color: '#334455' }}>{label}: </span>
                  <span style={{ color: '#778899' }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleCalculate}
              disabled={
                (deviceType !== 'dslr' && !selectedProfile) ||
                (deviceType === 'dslr' && !focalLength)
              }
              style={{
                width: '100%', padding: '8px 0', fontSize: 10, letterSpacing: 2,
                background: '#0d2a1a', border: '1px solid #44ddaa',
                color: '#44ddaa', cursor: 'pointer', fontFamily: FONT,
              }}>
              GET SETTINGS →
            </button>
          </div>
        )}

        {/* ── STEP 3: Results ── */}
        {step === 'results' && result && (
          <div>
            <div style={{ color: '#334455', fontSize: 8, marginBottom: 8 }}>{result.deviceLabel}</div>

            {/* Core settings */}
            <div style={{ marginBottom: 12 }}>
              <Row label="Mode"          value={result.mode} />
              <Row label="Aperture"      value={result.aperture} color="#44aaff" />
              <Row label="Shutter"       value={result.shutter} color="#44ffaa" />
              <Row label="ISO"           value={result.isoLabel} color="#ffcc44" />
              <Row label="White Balance" value={result.whiteBalance} color="#aabbcc" />
              <Row label="Focus"         value={result.focus} color="#aabbcc" />
              <Row label="Format"        value={result.format} color="#778899" />
              {result.ev && <Row label="EV" value={result.ev} color="#ff8844" />}
            </div>

            {/* Checklist */}
            <div style={{ background: '#060810', border: '1px solid #0d1525',
              borderRadius: 2, padding: '8px', marginBottom: 10, fontSize: 8, color: '#445566' }}>
              {result.livePhoto   && <div>📷 Live Photo: {result.livePhoto}</div>}
              {result.noiseReduction && <div>🔇 In-camera NR: {result.noiseReduction}</div>}
              {result.imageStabilizer && <div>🔒 Image Stabilizer: {result.imageStabilizer}</div>}
              {result.shutterDelay && <div>⏱ Shutter: {result.shutterDelay}</div>}
              <div>📐 Shutter limited by: {result.shutterLimitedBy}</div>
            </div>

            {/* Creative note */}
            <div style={{ background: '#0a1a10', border: '1px solid #1a3a2a',
              borderRadius: 2, padding: '6px 8px', marginBottom: 10,
              color: '#44aa77', fontSize: 8, lineHeight: 1.5 }}>
              💡 {result.creativeNote}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ background: '#1a0d00', border: '1px solid #3a2a00',
                    borderRadius: 2, padding: '5px 8px', marginBottom: 4,
                    color: '#cc8800', fontSize: 8 }}>{w}</div>
                ))}
              </div>
            )}

            {/* Troubleshoot button */}
            <button onClick={() => setStep('troubleshoot')} style={{
              width: '100%', padding: '7px 0', fontSize: 9, letterSpacing: 1,
              background: '#1a0a00', border: '1px solid #cc5500',
              color: '#ff8844', cursor: 'pointer', fontFamily: FONT, marginBottom: 6,
            }}>
              🔧 TROUBLESHOOT A PROBLEM
            </button>
            <button onClick={() => setStep('details')} style={{
              width: '100%', padding: '5px 0', fontSize: 8,
              background: 'none', border: '1px solid #1a2a3a',
              color: '#334455', cursor: 'pointer', fontFamily: FONT,
            }}>
              ← adjust inputs
            </button>
          </div>
        )}

        {/* ── STEP 4: Troubleshoot ── */}
        {step === 'troubleshoot' && (
          <div>
            <button onClick={() => { setStep('results'); setTroubleshootResults([]); setSelectedProblems([]) }}
              style={{ background: 'none', border: 'none', color: '#445566',
                fontSize: 9, cursor: 'pointer', marginBottom: 10, fontFamily: FONT }}>
              ← back to settings
            </button>

            {troubleshootResults.length === 0 ? (
              <div>
                <div style={{ color: '#aabbcc', fontSize: 10, marginBottom: 10 }}>
                  What's wrong with your shot?
                </div>
                {TROUBLESHOOT_OPTIONS.map(({ id, label }) => (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 6, cursor: 'pointer', color: '#778899', fontSize: 9 }}>
                    <input type="checkbox"
                      checked={selectedProblems.includes(id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedProblems(p => [...p, id])
                        else setSelectedProblems(p => p.filter(x => x !== id))
                      }} />
                    {label}
                  </label>
                ))}
                <button
                  onClick={handleTroubleshoot}
                  disabled={selectedProblems.length === 0}
                  style={{ width: '100%', padding: '7px 0', fontSize: 9, letterSpacing: 1,
                    marginTop: 8, background: '#0d2a1a', border: '1px solid #44ddaa',
                    color: '#44ddaa', cursor: 'pointer', fontFamily: FONT }}>
                  GET FIXES →
                </button>
              </div>
            ) : (
              <div>
                {troubleshootResults.map((fix, i) => (
                  <div key={i} style={{ marginBottom: 12, background: '#060810',
                    border: '1px solid #1a2a3a', borderRadius: 2, padding: '8px' }}>
                    <div style={{ color: '#ff8844', fontSize: 9, fontWeight: 'bold', marginBottom: 6 }}>
                      {fix.title}
                    </div>
                    {fix.steps.map((s, j) => (
                      <div key={j} style={{ color: '#aabbcc', fontSize: 8,
                        marginBottom: 3, paddingLeft: 8, borderLeft: '2px solid #1a3a2a' }}>
                        {s}
                      </div>
                    ))}
                  </div>
                ))}
                <button onClick={() => { setTroubleshootResults([]); setSelectedProblems([]) }}
                  style={{ width: '100%', padding: '5px 0', fontSize: 8,
                    background: 'none', border: '1px solid #1a2a3a',
                    color: '#334455', cursor: 'pointer', fontFamily: FONT }}>
                  ← check other problems
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
