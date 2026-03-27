// Precise Bortle lookup via lightpollutionmap.info SQM API
// Used by SubmitSpot and CameraSettings advisor

export async function fetchBortleFromLPM(lat, lon) {
  try {
    const url = `https://www.lightpollutionmap.info/PostLight.aspx?ql=wa_2015&qt=point&lng=${lon}&lat=${lat}`
    const res = await fetch(url)
    if (!res.ok) return null
    const text = (await res.text()).trim()
    const sqm = parseFloat(text)
    if (isNaN(sqm) || sqm < 15 || sqm > 23) return null
    return sqmToBortle(sqm)
  } catch {
    return null
  }
}

export function sqmToBortle(sqm) {
  if (sqm >= 21.99) return 1
  if (sqm >= 21.69) return 2
  if (sqm >= 21.49) return 3
  if (sqm >= 20.79) return 4
  if (sqm >= 20.29) return 5
  if (sqm >= 19.49) return 6
  if (sqm >= 18.49) return 7
  if (sqm >= 17.49) return 8
  return 9
}
