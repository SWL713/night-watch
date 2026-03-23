import { useState, useRef } from 'react'
import { submitPhoto } from '../hooks/useSpots.js'
import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from '../config.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'
const inputStyle = {
  background: '#060810', border: '1px solid #1a2a3a',
  color: '#ccd', padding: '8px 10px', fontSize: 12,
  fontFamily: FONT, outline: 'none', borderRadius: 2,
  width: '100%', boxSizing: 'border-box',
}

async function uploadToCloudinary(file) {
  if (CLOUDINARY_CLOUD.startsWith('REPLACE_ME')) {
    throw new Error('Cloudinary not configured yet')
  }
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST', body: fd,
  })
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json()
  return data.secure_url
}

export default function SubmitPhoto({ spot, spaceWeather, onClose }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) { setStatus({ error: 'Please select a photo' }); return }
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file)
      const { error } = await submitPhoto(spot.id, url, caption, {
        intensity: spaceWeather.intensity_label,
        bz: spaceWeather.bz_now,
        state: spaceWeather.state,
        timestamp: new Date().toISOString(),
      })
      if (error) throw new Error(error.message || error)
      setStatus({ success: true })
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setUploading(false)
    }
  }

  if (status?.success) return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 24, fontFamily: FONT, color: '#ccd', width: 300, textAlign: 'center' }}>
      <div style={{ color: '#44ddaa', fontSize: 14, marginBottom: 8 }}>✓ Photo Submitted</div>
      <div style={{ color: '#445566', fontSize: 11, marginBottom: 16 }}>
        Your photo will appear after approval.
      </div>
      <button onClick={onClose} style={{ ...inputStyle, cursor: 'pointer',
        color: '#44ddaa', border: '1px solid #44ddaa44', width: 'auto', padding: '6px 20px' }}>
        CLOSE
      </button>
    </div>
  )

  return (
    <div style={{ background: '#070b16', border: '1px solid #1a2a3a', borderRadius: 4,
      padding: 16, width: 300, fontFamily: FONT, color: '#ccd', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: '#44ddaa', fontSize: 12, letterSpacing: 2 }}>SUBMIT PHOTO</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          color: '#445566', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ color: '#445566', fontSize: 10, marginBottom: 10 }}>
        {spot.name}
      </div>

      {/* Conditions auto-tag */}
      <div style={{ background: '#060810', border: '1px solid #1a2035', borderRadius: 2,
        padding: '6px 10px', marginBottom: 10, fontSize: 10 }}>
        <div style={{ color: '#334455', marginBottom: 2 }}>CONDITIONS AT CAPTURE</div>
        <div style={{ color: spaceWeather.intensity_color }}>
          {spaceWeather.intensity_label} · Bz {spaceWeather.bz_now?.toFixed(1)} nT · {spaceWeather.state}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${preview ? '#44ddaa44' : '#1a2a3a'}`,
            borderRadius: 2, padding: preview ? 0 : '20px 0',
            cursor: 'pointer', textAlign: 'center', overflow: 'hidden',
          }}
        >
          {preview ? (
            <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
          ) : (
            <div style={{ color: '#334455', fontSize: 11 }}>Click to select photo</div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

        <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}
          value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Caption (optional)..." />

        {status?.error && <div style={{ color: '#ff5566', fontSize: 10 }}>{status.error}</div>}

        <button type="submit" disabled={uploading || !file} style={{
          ...inputStyle, cursor: file ? 'pointer' : 'not-allowed',
          color: file ? '#44ddaa' : '#334455',
          border: `1px solid ${file ? '#44ddaa44' : '#1a2035'}`,
          textAlign: 'center', letterSpacing: 2, marginTop: 4,
        }}>
          {uploading ? 'UPLOADING...' : 'SUBMIT FOR REVIEW'}
        </button>
      </form>
    </div>
  )
}
