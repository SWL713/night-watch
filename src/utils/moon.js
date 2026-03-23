// Moon calculations ported from render_aurora_card.py (LeFevre CME Watch)

function jd(dt) {
  let y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1
  const d = dt.getUTCDate() + dt.getUTCHours()/24 + dt.getUTCMinutes()/1440
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y/100), B = 2 - A + Math.floor(A/4)
  return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524.5
}

export function moonIllumination(dt = new Date()) {
  const jdVal = jd(dt)
  const T = (jdVal - 2451545.0) / 36525.0
  const r = x => x * Math.PI / 180

  // Sun longitude
  const Ls = ((280.46646 + 36000.76983*T) % 360 + 360) % 360
  const Ms = r(((357.52911 + 35999.05029*T - 0.0001537*T*T) % 360 + 360) % 360)
  const sunLon = (Ls + (1.914602 - 0.004817*T)*Math.sin(Ms) + 0.019993*Math.sin(2*Ms) + 360) % 360

  // Moon longitude
  const Lm  = ((218.3164477 + 481267.88123421*T) % 360 + 360) % 360
  const Mm  = r(((134.9633964 + 477198.8675055*T) % 360 + 360) % 360)
  const D   = r(((297.8501921 + 445267.1114034*T) % 360 + 360) % 360)
  const moonLon = (Lm + 6.289*Math.sin(Mm) - 1.274*Math.sin(2*D-Mm) + 0.658*Math.sin(2*D) + 360) % 360

  const phaseAngle = (moonLon - sunLon + 360) % 360
  const illumination = (1 - Math.cos(r(phaseAngle))) / 2

  const idx = Math.floor((phaseAngle + 22.5) / 45) % 8
  const phaseNames = ['new','waxing_crescent','first_quarter','waxing_gibbous',
                      'full','waning_gibbous','last_quarter','waning_crescent']
  const phaseLabels = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                       'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent']

  return {
    illumination,        // 0.0 – 1.0
    phaseAngle,          // degrees
    phaseName: phaseNames[idx],
    phaseLabel: phaseLabels[idx],
    phaseIndex: idx + 1, // 1-8 matching your image filenames
    imagePath: `/night-watch/moon/${idx+1}-${phaseNames[idx]}.png`,
  }
}

function moonTimesForDate(date) {
  const NY_LAT = 40.7128, NY_LON = -74.0060
  const H0 = -0.583 * Math.PI / 180

  function jdFromDate(d) {
    return jd(d)
  }

  function moonAltitude(jdVal) {
    const T = (jdVal - 2451545.0) / 36525
    const gmst = ((280.46061837 + 360.98564736629*(jdVal-2451545.0)) % 360 + 360) % 360
    const lst = (gmst + NY_LON + 360) % 360
    const r = x => x * Math.PI / 180
    const Lm = ((218.3164477 + 481267.88123421*T) % 360 + 360) % 360
    const Mm = r(((134.9633964 + 477198.8675055*T) % 360 + 360) % 360)
    const D  = r(((297.8501921 + 445267.1114034*T) % 360 + 360) % 360)
    const F  = r(((93.2720950  + 483202.0175233*T) % 360 + 360) % 360)
    const eLon = r((Lm + 6.289*Math.sin(Mm) - 1.274*Math.sin(2*D-Mm) +
                    0.658*Math.sin(2*D) - 0.214*Math.sin(2*Mm) + 360) % 360)
    const eLat = r(5.128*Math.sin(F))
    const eps = r(23.439 - 0.013*T)
    const ra = ((Math.atan2(Math.sin(eLon)*Math.cos(eps) - Math.tan(eLat)*Math.sin(eps),
                            Math.cos(eLon)) * 180/Math.PI) + 360) % 360
    const dec = Math.asin(Math.sin(eLat)*Math.cos(eps) + Math.cos(eLat)*Math.sin(eps)*Math.sin(eLon))
    const ha = r((lst - ra + 360) % 360)
    return Math.asin(Math.sin(dec)*Math.sin(r(NY_LAT)) + Math.cos(dec)*Math.cos(r(NY_LAT))*Math.cos(ha))
  }

  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const baseJD = jdFromDate(base)
  let crossings = [], prevAlt = null

  for (let step = 0; step <= 24*6; step++) {
    const frac = step / (24*6)
    const jdT = baseJD + frac
    const alt = moonAltitude(jdT)
    if (prevAlt !== null) {
      if (prevAlt < H0 && alt >= H0) crossings.push({ type: 'rise', jd: jdT - 1/(24*6*2) })
      else if (prevAlt > H0 && alt <= H0) crossings.push({ type: 'set', jd: jdT - 1/(24*6*2) })
    }
    prevAlt = alt
  }

  function jdToDate(jdV) {
    let z = Math.floor(jdV + 0.5), f = (jdV + 0.5) - z
    let A = z < 2299161 ? z : z + 1 + Math.floor((z-1867216.25)/36524.25) -
            Math.floor(Math.floor((z-1867216.25)/36524.25)/4)
    const B = A+1524, C = Math.floor((B-122.1)/365.25), D2 = Math.floor(365.25*C)
    const E = Math.floor((B-D2)/30.6001)
    const dayFrac = B - D2 - Math.floor(30.6001*E) + f
    const day = Math.floor(dayFrac), hour = (dayFrac - day)*24
    const month = E < 14 ? E-1 : E-13, year = month > 2 ? C-4716 : C-4715
    return new Date(Date.UTC(year, month-1, day, Math.floor(hour), Math.floor((hour%1)*60)))
  }

  return {
    rise: crossings.find(c => c.type==='rise') ? jdToDate(crossings.find(c=>c.type==='rise').jd) : null,
    set:  crossings.find(c => c.type==='set')  ? jdToDate(crossings.find(c=>c.type==='set').jd)  : null,
  }
}

export function getMoonData(dt = new Date()) {
  const illum = moonIllumination(dt)
  const today = moonTimesForDate(dt)
  const tomorrow = moonTimesForDate(new Date(dt.getTime() + 86400000))

  // Collect all rise/set crossings across yesterday/today/tomorrow
  const yesterday = moonTimesForDate(new Date(dt.getTime() - 86400000))
  const allCrossings = []
  for (const [day, obj] of [[yesterday, 'yesterday'], [today, 'today'], [tomorrow, 'tomorrow']]) {
    if (day.rise) allCrossings.push({ type: 'rise', time: day.rise })
    if (day.set)  allCrossings.push({ type: 'set',  time: day.set })
  }
  allCrossings.sort((a,b) => a.time - b.time)

  return { ...illum, rise: today.rise, set: today.set, allCrossings }
}

// Is the moon above the horizon at a given datetime?
export function isMoonUp(dt, moonData) {
  const { allCrossings } = moonData
  const risesBefore = allCrossings.filter(c => c.type==='rise' && c.time <= dt).length
  const setsBefore  = allCrossings.filter(c => c.type==='set'  && c.time <= dt).length
  return risesBefore > setsBefore
}

// Moon interference score 0-1 for a given datetime
export function moonInterference(dt, moonData) {
  if (!isMoonUp(dt, moonData)) return 0
  return moonData.illumination
}
