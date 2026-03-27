// ── Night Watch Camera Settings Engine ───────────────────────────────────────
// Calculates recommended aurora photography settings based on device,
// conditions, and location data.

// Aurora motion shutter ceilings (seconds) by intensity label
const AURORA_MOTION_LIMIT = {
  'Calm':       20,
  'Weak':       15,
  'Mild':       10,
  'Moderate':    6,
  'Strong':      4,
  'Very Strong': 2,
  'Extreme':     1,
}

// Standard ISO stops to round to
const ISO_STOPS = [100, 200, 400, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 12800]

// Round to nearest standard ISO stop
function roundISO(iso) {
  return ISO_STOPS.reduce((prev, curr) =>
    Math.abs(curr - iso) < Math.abs(prev - iso) ? curr : prev
  )
}

// Round shutter to clean value
function roundShutter(s) {
  if (s >= 15) return Math.round(s)
  if (s >= 5)  return Math.round(s)
  if (s >= 2)  return Math.round(s * 2) / 2   // 0.5s steps
  return Math.round(s * 10) / 10               // 0.1s steps
}

// White balance by Bortle
function wbForBortle(bortle) {
  if (bortle <= 4) return { k: 4000, label: '4000K' }
  if (bortle <= 6) return { k: 3500, label: '3500K' }
  return { k: 3200, label: '3200K' }
}

// ── Main calculation ──────────────────────────────────────────────────────────

export function calculateCameraSettings({
  // Device
  deviceType,      // 'iphone' | 'android' | 'dslr'
  profile,         // camera profile from Supabase (or null for DSLR manual entry)

  // DSLR manual entry
  sensorSize,      // 'full_frame' | 'apsc' | 'mft'
  focalLength,     // mm (DSLR only)
  maxAperture,     // f-number

  // Support
  hasTripod,
  hasStarTracker,

  // Conditions (auto from app)
  intensity,       // 'Calm' | 'Weak' | ... | 'Extreme'
  moonUp,          // boolean
  moonIllumination, // 0-100
  bortle,          // 1-9
  latitude,        // degrees

  // Shooting preference
  shootingGoal,    // 'color' | 'structure' (optional)
}) {

  // ── Step 1: Determine crop factor and focal length equivalent ─────────────
  let cropFactor, focalEquiv, aperture, baseISO, maxISO, deviceLabel
  let isPhone = deviceType === 'iphone' || deviceType === 'android'

  if (deviceType === 'dslr') {
    cropFactor = sensorSize === 'full_frame' ? 1.0
               : sensorSize === 'apsc'       ? 1.5
               : 2.0 // mft
    focalEquiv  = Math.round(focalLength * cropFactor)
    aperture    = maxAperture
    baseISO     = sensorSize === 'full_frame' ? 1600
                : sensorSize === 'apsc'       ? 1000
                : 800
    maxISO      = sensorSize === 'full_frame' ? 6400
                : sensorSize === 'apsc'       ? 3200
                : 1600
    deviceLabel = `${sensorSize.replace('_', ' ').toUpperCase()} — ${focalLength}mm (${focalEquiv}mm equiv) f/${aperture}`
  } else {
    // Phone — use profile data
    cropFactor  = profile?.crop_factor  || 6.0
    focalEquiv  = profile?.focal_length_equiv || 26
    aperture    = profile?.aperture     || 1.8
    deviceLabel = `${profile?.make} ${profile?.model}`

    if (deviceType === 'iphone') {
      const isProModel = profile?.has_proraw
      baseISO = focalEquiv <= 24 ? (isProModel ? 1000 : 800) : (isProModel ? 800 : 640)
      maxISO  = isProModel ? 2000 : 1600
    } else {
      // Android
      const isUltra = profile?.model?.toLowerCase().includes('ultra') || profile?.model?.toLowerCase().includes('pro')
      baseISO = isUltra ? 800 : 640
      maxISO  = isUltra ? 1600 : 1200
    }
  }

  // ── Step 2: Calculate shutter speed ───────────────────────────────────────

  // Ceiling A: star trailing (NPF simplified as 500 rule)
  let starCeiling = isPhone ? 999 : (500 / (cropFactor * focalLength))
  if (hasStarTracker) starCeiling *= 4

  // Ceiling B: aurora motion
  const motionCeiling = AURORA_MOTION_LIMIT[intensity] || 10

  // Phone caps
  let phoneCap = 999
  if (deviceType === 'iphone')  phoneCap = 10
  if (deviceType === 'android') phoneCap = 15

  const rawShutter = Math.min(starCeiling, motionCeiling, phoneCap)

  // Shooting goal nudge
  let shutter = rawShutter
  if (shootingGoal === 'structure' && shutter > 3) shutter = Math.min(shutter, shutter * 0.6)
  if (shootingGoal === 'color'     && shutter < motionCeiling) shutter = Math.min(rawShutter * 1.3, motionCeiling)

  shutter = roundShutter(shutter)

  // ── Step 3: Calculate ISO ─────────────────────────────────────────────────
  let iso = baseISO

  // Aperture penalty vs f/2.8 reference
  if (!isPhone) {
    if (aperture >= 4.0)        iso *= 2.0
    else if (aperture >= 3.5)   iso *= 1.56
    else if (aperture >= 3.2)   iso *= 1.3
  }

  // Moon penalty
  if (moonUp) {
    if (moonIllumination > 60) iso *= 0.4
    else if (moonIllumination > 25) iso *= 0.65
  }

  // Light pollution penalty
  if (bortle >= 7) iso *= 0.6
  else if (bortle >= 5) iso *= 0.8

  // Latitude compensation
  if (latitude > 55) iso *= 0.7          // aurora likely overhead, brighter
  else if (latitude < 43) iso *= 1.5     // rare event, very faint

  // Shutter compensation — if shorter than star ceiling, need more ISO
  if (!isPhone && shutter < starCeiling && shutter < rawShutter) {
    iso *= (rawShutter / shutter)
  }

  iso = Math.min(roundISO(iso), maxISO)

  // ── Step 4: White balance ─────────────────────────────────────────────────
  const wb = wbForBortle(bortle)

  // ── Step 5: Determine limiting factor for shutter ─────────────────────────
  let shutterLimitedBy = 'aurora motion'
  if (!isPhone && starCeiling < motionCeiling) shutterLimitedBy = 'star trailing'
  if (hasStarTracker) shutterLimitedBy = 'aurora motion (tracker active)'

  // ── Step 6: Build output ──────────────────────────────────────────────────
  const warnings = []

  if (moonUp && moonIllumination > 60)
    warnings.push(`🌕 Bright moon (${moonIllumination}% illuminated) will wash out long exposures — ISO reduced`)
  if (moonUp && moonIllumination > 80)
    warnings.push(`🌕 Consider keeping exposures under 8s to limit moon glow in frame`)
  if (bortle >= 7)
    warnings.push(`🏙 High light pollution (Bortle ${bortle}) — WB set cooler to counteract orange skyglow`)
  if (!hasTripod)
    warnings.push(`⚠️ No tripod — consider stabilizing on a flat surface. At ${shutter}s handheld shots will be blurry`)
  if (aperture > 2.8 && !isPhone)
    warnings.push(`📷 f/${aperture} lens — ISO raised to compensate vs f/2.8 reference`)
  if (latitude < 43)
    warnings.push(`📍 Mid/lower latitude — aurora will appear near the horizon, ISO raised accordingly`)

  const output = {
    deviceLabel,
    deviceType,
    // Core settings
    aperture:     isPhone ? `f/${aperture} (fixed)` : `f/${aperture}`,
    shutter:      `${shutter}s`,
    shutterRaw:   shutter,
    iso,
    isoLabel:     `ISO ${iso}`,
    whiteBalance: wb.label,
    // Mode and format
    mode:         isPhone ? (deviceType === 'iphone' ? 'Night Mode' + (profile?.has_proraw ? ' / ProRAW' : '') : 'Pro Mode') : 'Manual (M)',
    format:       isPhone ? (profile?.has_proraw ? 'ProRAW recommended' : 'JPEG (RAW if available)') : 'RAW recommended',
    // Focus
    focus:        isPhone && deviceType === 'iphone' && !profile?.has_proraw
                  ? 'Auto (Night Mode handles focus)'
                  : 'Manual → Infinity (∞)',
    // Phone-specific
    ev:           isPhone ? '-1.0 to -2.0 if aurora is bright' : null,
    livePhoto:    deviceType === 'iphone' ? 'OFF' : null,
    // DSLR-specific
    imageStabilizer: !isPhone ? 'OFF (on tripod)' : null,
    noiseReduction:  !isPhone ? 'OFF (use post-processing)' : null,
    shutterDelay:    hasTripod ? '2 second timer or remote' : null,
    // Context
    shutterLimitedBy,
    warnings,
    // Creative note
    creativeNote: `Longer exposure (up to ${motionCeiling}s) = more color and smooth gradients. Shorter (${Math.max(1, Math.round(motionCeiling * 0.3))}–${Math.round(motionCeiling * 0.5)}s) = sharper structure and ribbon detail.`,
    // For troubleshooter
    calculatedNPF:      isPhone ? null : Math.round(starCeiling),
    motionLimit:        motionCeiling,
    baseInputs: { intensity, bortle, latitude, moonUp, moonIllumination, hasTripod, aperture, shutter, iso },
  }

  return output
}

// ── Troubleshooter ────────────────────────────────────────────────────────────

export function getTroubleshootingFix(problem, currentSettings) {
  const { shutter, iso, aperture, calculatedNPF, motionLimit } = currentSettings

  const fixes = {
    too_dark: {
      title: 'Photo too dark',
      steps: [
        `Raise ISO from ${iso} to ${Math.min(roundISO(iso * 2), 6400)}`,
        `Or increase shutter from ${shutter}s to ${Math.min(roundShutter(shutter * 1.5), motionLimit)}s (if aurora allows)`,
        'Check focus — soft focus reads as dark and flat',
      ],
    },
    too_bright: {
      title: 'Photo too bright / washed out',
      steps: [
        `Lower ISO from ${iso} to ${roundISO(iso * 0.5)}`,
        `Or decrease shutter from ${shutter}s to ${roundShutter(shutter * 0.6)}s`,
        'If aurora just intensified, cut shutter first — ISO second',
      ],
    },
    grainy: {
      title: 'Photo grainy / noisy',
      steps: [
        `Lower ISO from ${iso} to ${roundISO(iso * 0.5)}`,
        `Compensate by increasing shutter to ${Math.min(roundShutter(shutter * 2), motionLimit)}s`,
        'Shoot RAW — noise reduction in post is much cleaner than in-camera',
        'Turn OFF in-camera noise reduction if on DSLR',
      ],
    },
    aurora_smear: {
      title: 'Aurora looks smeared / no detail',
      steps: [
        `Aurora is moving faster than your ${shutter}s exposure`,
        `Shorten shutter to ${Math.max(1, Math.round(motionLimit * 0.5))}–${Math.round(motionLimit * 0.7)}s`,
        `Raise ISO to ${Math.min(roundISO(iso * (shutter / (motionLimit * 0.6))), 6400)} to compensate`,
      ],
    },
    everything_blurry: {
      title: 'Everything blurry',
      steps: [
        'Camera shake — the most common cause',
        'Use 2-second timer or remote shutter release',
        'Check tripod is fully locked on solid ground',
        'Turn OFF image stabilizer on DSLR (it fights itself on tripod)',
        'Wait 1–2 seconds after any wind gust before shooting',
      ],
    },
    stars_trailing: {
      title: 'Stars are trailing / streaky',
      steps: [
        calculatedNPF
          ? `Your NPF limit for this lens is ${calculatedNPF}s — shorten shutter to ${Math.min(calculatedNPF, shutter - 2)}s or less`
          : `Shorten shutter — stars trailing means exposure is too long for this focal length`,
        'Or zoom out wider to increase the NPF limit',
        'Or add a star tracker to extend the limit by 4×',
      ],
    },
    aurora_blurry_stars_sharp: {
      title: 'Aurora blurry but stars are sharp',
      steps: [
        `Aurora is moving faster than your ${shutter}s allows`,
        `Shorten to ${Math.max(1, Math.round(shutter * 0.5))}–${Math.round(shutter * 0.7)}s`,
        `Raise ISO to ${Math.min(roundISO(iso * (shutter / (shutter * 0.6))), 6400)} to maintain exposure`,
      ],
    },
    focus_soft: {
      title: 'Focus looks soft / hazy',
      steps: [
        'Re-focus manually on the brightest star you can see',
        'Use live view zoomed 10× on a star to confirm sharp focus',
        'Mark the correct infinity position on your lens with tape',
        'On phones: tap a bright star or distant light before shooting',
        'Check for condensation on lens — wipe gently with microfiber',
      ],
    },
  }

  return fixes[problem] || null
}
