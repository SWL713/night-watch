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

import { loadBortleGrid, getBortle } from '../utils/bortleGrid.js'

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
    address: '',
    horizon_rating: '',
  })
  const [bortleLookup, setBortleLookup] = useState(null)  // 'loading' | number | 'failed'
  const [bortleOverride, setBortleOverride] = useState(false)
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

  // Load bortle grid once
  const [bortleGrid, setBortleGrid] = useState(null)
  useEffect(() => { loadBortleGrid().then(g => { if (g) setBortleGrid(g) }) }, [])

  // Auto-lookup Bortle from grid when lat/lon are valid
  useEffect(() => {
    const lat = parseFloat(form.lat)
    const lon = parseFloat(form.lon)
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setBortleLookup(null)
      setBortleOverride(false)
      return
    }
    if (!bortleGrid) return
    const raw = getBortle(bortleGrid, lat, lon)
    // Latitude fallback for areas outside grid coverage
    let b
    if (!raw || raw === 5 && lat > 52) {
      if (lat > 65) b = 1
      else if (lat > 58) b = 2
      else if (lat > 52) b = 2
      else b = raw || 5
    } else {
      b = Math.round(raw)
    }
    setBortleLookup(b)
    setBortleOverride(false)
    set('bortle', String(b))
  }, [form.lat, form.lon, bortleGrid])

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
      address: form.address || null,
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
        {bortleLookup === 'loading' && (
          <div style={{ ...inputStyle, color: '#334455', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between' }}>
            <span>Bortle class</span>
            <span style={{ fontSize: 9 }}>looking up...</span>
          </div>
        )}
        {bortleLookup !== 'loading' && !bortleOverride && typeof bortleLookup === 'number' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ ...inputStyle, flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', color: '#44ddaa' }}>
              <span style={{ color: '#778899', fontSize: 10 }}>Bortle class</span>
              <span style={{ fontSize: 14, fontWeight: 'bold' }}>{bortleLookup}
                <span style={{ color: '#44aaaa', fontSize: 8, marginLeft: 6 }}>auto ✓</span>
              </span>
            </div>
            <button type="button" onClick={() => setBortleOverride(true)}
              style={{ background: '#060810', border: '1px solid #1a2a3a',
                color: '#445566', fontSize: 8, fontFamily: FONT,
                padding: '8px 8px', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap' }}>
              OVERRIDE
            </button>
          </div>
        )}
        {(bortleOverride || bortleLookup === 'failed' || bortleLookup === null) && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input style={{ ...inputStyle, flex: 1 }} value={form.bortle}
              onChange={e => set('bortle', e.target.value)}
              placeholder="Bortle class (1–9) *" required />
            {bortleOverride && (
              <button type="button" onClick={() => { setBortleOverride(false); set('bortle', String(bortleLookup)) }}
                style={{ background: '#060810', border: '1px solid #1a2a3a',
                  color: '#445566', fontSize: 8, fontFamily: FONT,
                  padding: '8px 8px', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap' }}>
                RESET
              </button>
            )}
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

        <input style={inputStyle} value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="Street address (optional — for directions)" maxLength={200} />

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
