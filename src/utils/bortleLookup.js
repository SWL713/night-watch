// Precise Bortle lookup via lightpollutionmap.info API
// Used by both SubmitSpot and CameraSettings advisor

export async function fetchBortleFromLPM(lat, lon) {
  try {
    const url = `https://www.lightpollutionmap.info/PostLight.aspx?ql=wa_2015&qt=point&lng=${lon}&lat=${lat}`
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const text = await res.text()
    const sqm = parseFloat(text.trim())
    if (isNaN(sqm)) return null
    // SQM to Bortle conversion
    if (sqm >= 21.99) return 1
    if (sqm >= 21.69) return 2
    if (sqm >= 21.49) return 3
    if (sqm >= 20.79) return 4
    if (sqm >= 20.29) return 5
    if (sqm >= 19.49) return 6
    if (sqm >= 18.49) return 7
    if (sqm >= 17.49) return 8
    return 9
  } catch {
    return null
  }
}
