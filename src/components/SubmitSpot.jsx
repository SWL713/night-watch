import { useState, useRef, useEffect } from 'react'
import { submitSpot, submitPhoto } from '../hooks/useSpots.js'
import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from '../config.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '8px 10px', fontSize: 12,
  fontFamily: FONT, outline: 'none', borderRadius: 2, width: '100%',
  boxSizing: 'border-box',
}

// ── Lightpollutionmap.info API Bortle lookup ──────────────────────────────────
async function fetchBortleFromLPM(lat, lon) {
  try {
    const url = `https://www.lightpollutionmap.info/PostLight.aspx?ql=wa_2015&qt=point&lng=${lon}&lat=${lat}`
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const text = await res.text()
    // Response is SQM value as plain text e.g. "21.45"
    const sqm = parseFloat(text.trim())
    if (isNaN(sqm)) return null
    // Convert SQM to Bortle class
    if (sqm >= 22.0) return 1
    if (sqm >= 21.9) return 2
    if (sqm >= 21.7) return 2
    if (sqm >= 21.5) return 3
    if (sqm >= 21.3) return 3
    if (sqm >= 20.8) return 4
    if (sqm >= 20.3) return 5
    if (sqm >= 19.5) return 6
    if (sqm >= 18.5) return 7
    if (sqm >= 17.5) return 8
    return 9
  } catch {
    return null
  }
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function compressImage(file, maxBytes = 8 * 1024 * 1024) {
  if (file.size <= maxBytes) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const maxDim = 2400
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (blob && blob.size <= maxBytes) { resolve(blob); return }
        canvas.toBlob(blob2 => resolve(blob2 || blob), 'image/jpeg', 0.70)
      }, 'image/jpeg', 0.85)
    }
    img.src = url
  })
}

async function uploadToCloudinary(file) {
  if (CLOUDINARY_CLOUD.startsWith('REPLACE_ME')) throw new Error('Cloudinary not configured')
  const compressed = await compressImage(file)
  const fd = new FormData()
  fd.append('file', compressed, 'photo.jpg')
  fd.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST', body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Upload failed (${res.status})`)
  }
  return (await res.json()).secure_url
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SubmitSpot({ onClose, initialCoords }) {
  const [step, setStep] = useState('spot')   // 'spot' | 'photo' | 'done'
  const [submittedSpotId, setSubmittedSpotId] = useState(null)
  const [submittedSpotName, setSubmittedSpotName] = useState('')

  // Spot form
  const [form, setForm] = useState({
    name: '',
    lat:  initialCoords ? initialCoords.lat.toFixed(6) : '',
    lon:  initialCoords ? initialCoords.lon.toFixed(6) : '',
    bortle: '',
    view_direction: '',
    access_notes: '',
    horizon_rating: '',
  })
  const [bortleLookup, setBortleLookup] = useState(null)  // 'loading' | number | 'failed'
  const [spotSubmitting, setSpotSubmitting] = useState(false)
  const [spotError, setSpotError] = useState(null)

  // Photo form
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [photographerName, setPhotographerName] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState(null)
  const fileRef = useRef()

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-lookup Bortle when lat/lon are valid
  useEffect(() => {
    const lat = parseFloat(form.lat)
    const lon = parseFloat(form.lon)
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return
    // Debounce — only look up after user stops typing
    const t = setTimeout(async () => {
      setBortleLookup('loading')
      const b = await fetchBortleFromLPM(lat, lon)
      if (b !== null) {
        setBortleLookup(b)
        setForm(f => ({ ...f, bortle: String(b) }))
      } else {
        setBortleLookup('failed')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [form.lat, form.lon])

  // ── Step 1: Submit spot ───────────────────────────────────────────────────
  async function handleSpotSubmit(e) {
    e.preventDefault()
    setSpotSubmitting(true)
    setSpotError(null)
    const lat = parseFloat(form.lat), lon = parseFloat(form.lon)
    if (isNaN(lat) || isNaN(lon)) {
      setSpotError('Invalid coordinates')
      setSpotSubmitting(false)
      return
    }
    const { data, error } = await submitSpot({
      name: form.name, lat, lon,
      bortle: parseInt(form.bortle),
      view_direction: form.view_direction,
      access_notes: form.access_notes,
      horizon_rating: parseInt(form.horizon_rating),
    })
    setSpotSubmitting(false)
    if (error) { setSpotError(error.message || String(error)); return }
    // Store spot id for photo attachment
    const spotId = data?.[0]?.id || data?.id || null
    setSubmittedSpotId(spotId)
    setSubmittedSpotName(form.name)
    setStep('photo')
  }

  // ── Step 2: Upload photo (optional) ──────────────────────────────────────
  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handlePhotoSubmit(e) {
    e.preventDefault()
    if (!file) return
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      const url = await uploadToCloudinary(file)
      const { error } = await submitPhoto(submittedSpotId, url, caption, photographerName, null)
      if (error) throw new Error(error.message || error)
      setStep('done')
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 24, fontFamily: FONT, color: '#ccd', width: 300, textAlign: 'center' }}>
      <div style={{ color: '#44ddaa', fontSize: 14, marginBottom: 8 }}>✓ All Submitted</div>
      <div style={{ color: '#445566', fontSize: 11, marginBottom: 16 }}>
        Your spot and photo are pending review and will appear on the map once approved.
      </div>
      <button onClick={onClose} style={{ ...inputStyle, cursor: 'pointer', color: '#44ddaa',
        border: '1px solid #44ddaa44', width: 'auto', padding: '6px 20px' }}>CLOSE</button>
    </div>
  )

  // ── Step 2: Optional photo ────────────────────────────────────────────────
  if (step === 'photo') return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12 }}>
      <div style={{ color: '#44ddaa', fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
        ✓ Spot submitted for review
      </div>
      <div style={{ color: '#445566', fontSize: 10, marginBottom: 14 }}>
        Want to add a photo of {submittedSpotName}? (optional)
      </div>

      <form onSubmit={handlePhotoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${preview ? '#44ddaa44' : '#1a2a3a'}`,
            borderRadius: 2, padding: preview ? 0 : '20px 0',
            cursor: 'pointer', textAlign: 'center', overflow: 'hidden' }}>
          {preview
            ? <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 140, objectFit: 'cover' }} />
            : <div style={{ color: '#334455', fontSize: 11 }}>Click to select photo</div>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

        {file && (
          <>
            <input style={inputStyle} value={photographerName}
              onChange={e => setPhotographerName(e.target.value)}
              placeholder="Your name / handle (optional)" maxLength={80} />
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}
              value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Caption (optional)..." />
          </>
        )}

        {photoError && <div style={{ color: '#ff5566', fontSize: 10 }}>{photoError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          {file && (
            <button type="submit" disabled={photoUploading} style={{
              ...inputStyle, flex: 2, cursor: 'pointer', color: '#44ddaa',
              border: '1px solid #44ddaa44', textAlign: 'center', letterSpacing: 1,
            }}>
              {photoUploading ? 'UPLOADING...' : 'SUBMIT PHOTO'}
            </button>
          )}
          <button type="button" onClick={() => setStep('done')} style={{
            ...inputStyle, flex: 1, cursor: 'pointer', color: '#445566',
            border: '1px solid #1a2a3a', textAlign: 'center',
          }}>
            SKIP
          </button>
        </div>
      </form>
    </div>
  )

  // ── Step 1: Spot form ─────────────────────────────────────────────────────
  return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: '#44ddaa', fontSize: 12, letterSpacing: 2 }}>SUBMIT LOCATION</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      <form onSubmit={handleSpotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={inputStyle} value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Location name *" required />

        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={form.lat}
            onChange={e => set('lat', e.target.value)} placeholder="Latitude *" required />
          <input style={{ ...inputStyle, flex: 1 }} value={form.lon}
            onChange={e => set('lon', e.target.value)} placeholder="Longitude *" required />
        </div>

        {/* Bortle with auto-lookup */}
        <div style={{ position: 'relative' }}>
          <input style={inputStyle} value={form.bortle}
            onChange={e => set('bortle', e.target.value)}
            placeholder="Bortle class (1–9) *" required />
          {bortleLookup === 'loading' && (
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              color: '#334455', fontSize: 8, fontFamily: FONT }}>looking up...</div>
          )}
          {typeof bortleLookup === 'number' && (
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              color: '#44aaaa', fontSize: 8, fontFamily: FONT }}>auto ✓</div>
          )}
          {bortleLookup === 'failed' && (
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              color: '#443322', fontSize: 8, fontFamily: FONT }}>manual</div>
          )}
        </div>
        {typeof bortleLookup === 'number' && (
          <div style={{ color: '#334455', fontSize: 9, marginTop: -4 }}>
            Auto-detected Bortle {bortleLookup} from lightpollutionmap.info — edit if you know better
          </div>
        )}

        <select style={{ ...inputStyle, color: form.view_direction ? '#ccd' : '#445566' }}
          value={form.view_direction} onChange={e => set('view_direction', e.target.value)} required>
          <option value="">View direction *</option>
          {['N','NE','E','SE','S','SW','W','NW','All directions'].map(d =>
            <option key={d} value={d}>{d}</option>
          )}
        </select>

        <select style={{ ...inputStyle, color: form.horizon_rating ? '#ccd' : '#445566' }}
          value={form.horizon_rating} onChange={e => set('horizon_rating', e.target.value)} required>
          <option value="">Horizon quality *</option>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} star{n>1?'s':''}</option>)}
        </select>

        <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}
          value={form.access_notes} onChange={e => set('access_notes', e.target.value)}
          placeholder="Access notes, parking, restrictions..." />

        {spotError && <div style={{ color: '#ff5566', fontSize: 10 }}>{spotError}</div>}

        <button type="submit" disabled={spotSubmitting} style={{
          ...inputStyle, cursor: 'pointer', color: '#44ddaa',
          border: '1px solid #44ddaa44', textAlign: 'center',
          letterSpacing: 2, marginTop: 4,
        }}>
          {spotSubmitting ? 'SUBMITTING...' : 'SUBMIT LOCATION →'}
        </button>
      </form>
    </div>
  )
}
