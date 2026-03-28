import { useState, useEffect } from 'react'
import { PASSPHRASE } from '../config.js'

const STORAGE_KEY = 'nw_auth'
const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export function useAuth() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === PASSPHRASE) setAuthed(true)
  }, [])

  function login(phrase) {
    if (phrase.trim().toLowerCase() === PASSPHRASE.toLowerCase()) {
      localStorage.setItem(STORAGE_KEY, PASSPHRASE)
      setAuthed(true)
      return true
    }
    return false
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY)
    setAuthed(false)
  }

  return { authed, login, logout }
}

export default function Auth({ onAuth }) {
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState(false)
  const [showGuidelines, setShowGuidelines] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (phrase.trim().toLowerCase() === PASSPHRASE.toLowerCase()) {
      localStorage.setItem(STORAGE_KEY, PASSPHRASE)
      // Show guidelines first if not seen this session
      if (!sessionStorage.getItem('nw_guidelines_seen')) {
        setShowGuidelines(true)
      } else {
        onAuth()
      }
    } else {
      setError(true)
      setPhrase('')
      setTimeout(() => setError(false), 2000)
    }
  }

  function acknowledgeGuidelines() {
    sessionStorage.setItem('nw_guidelines_seen', '1')
    setShowGuidelines(false)
    onAuth()
  }

  // Guidelines screen — full overlay, must acknowledge to proceed
  if (showGuidelines) return (
    <div style={{
      minHeight: '100vh', background: '#04060e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, padding: 20,
    }}>
      <div style={{
        background: '#07090f', border: '1px solid #1a2a3a',
        borderRadius: 6, padding: '28px 26px', maxWidth: 360, width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
      }}>
        <div style={{ color: '#44ddaa', fontSize: 11, letterSpacing: 2, marginBottom: 16 }}>
          🌌 COMMUNITY GUIDELINES
        </div>
        <div style={{ color: '#aabbcc', fontSize: 11, lineHeight: 1.8, marginBottom: 22 }}>
          Night Watch is powered by our aurora hunting community. Spots and photos are submitted by members like you and are not independently verified.
          <br /><br />
          When visiting any location, please respect private property, posted hours, and all applicable laws. Your safety is your responsibility.
          <br /><br />
          Anything can be flagged for admin review — we reserve the right to edit or remove any content that does not meet community standards.
        </div>
        <button
          onClick={acknowledgeGuidelines}
          style={{
            width: '100%', padding: '11px 0', fontSize: 11, letterSpacing: 2,
            background: '#0d1a2a', border: '1px solid #44ddaa',
            color: '#44ddaa', cursor: 'pointer', fontFamily: FONT, borderRadius: 3,
          }}
        >
          GOT IT — ENTER NIGHT WATCH
        </button>
      </div>
    </div>
  )

  // Login screen
  return (
    <div style={{
      minHeight: '100vh', background: '#060810',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#ccd',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img
          src="/night-watch/logo.jpg"
          alt="Substorm Society"
          style={{ width: 160, height: 160, objectFit: 'contain', marginBottom: 16 }}
        />
        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#44ddaa', letterSpacing: 4 }}>
          NIGHT WATCH
        </div>
        <div style={{ fontSize: 12, color: '#445566', marginTop: 6, letterSpacing: 2 }}>
          AURORA HUNTING PLATFORM
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <input
          type="password"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          placeholder="Enter passphrase"
          autoFocus
          style={{
            background: '#0a0e18', border: `1px solid ${error ? '#ff4444' : '#1a2a3a'}`,
            color: '#ccd', padding: '12px 16px', fontSize: 14,
            fontFamily: 'monospace', outline: 'none', borderRadius: 2,
            transition: 'border-color 0.2s',
          }}
        />
        <button type="submit" style={{
          background: '#0d1a2a', border: '1px solid #44ddaa',
          color: '#44ddaa', padding: '10px 16px', fontSize: 13,
          fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 2,
          borderRadius: 2,
        }}>
          ENTER
        </button>
        {error && (
          <div style={{ color: '#ff4444', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
            INVALID PASSPHRASE
          </div>
        )}
      </form>

      <div style={{ marginTop: 40, color: '#1e2a3a', fontSize: 11, letterSpacing: 1 }}>
        MEMBERS ONLY · GET PHRASE FROM GROUP
      </div>
    </div>
  )
}
