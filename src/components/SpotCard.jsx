import { useState, useEffect } from 'react'
import { fetchSpotForecast } from '../hooks/useCloudCover.js'
import { combinedScore, locationScore, bortleScore, scoreToColor, scoreToLabel, pinColor } from '../utils/scoring.js'

// Match HeatmapLayer combined scoring exactly
function calcChaseScore(cloudcover, bortle) {
  const bScore = bortleScore(bortle)
  const adjusted = cloudcover * 100
  const cScore = 1 - adjusted / 100
  if (cScore <= 0) return 0
  return cScore * bScore
}

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

function formatTime(dt) {
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York' })
}

export default function SpotCard({ spot, onClose, spaceWeather, onSubmitPhoto }) {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info') // info | photos | submit

  useEffect(() => {
    fetchSpotForecast(spot.lat, spot.lon)
      .then(f => { setForecast(f); setLoading(false) })
      .catch(() => setLoading(false))
  }, [spot.id])

  const locScore = locationScore(spot)
  const currentCloud = forecast?.[0]?.cloudcover ?? 50
  const chaseScoreNow = calcChaseScore(currentCloud, spot.bortle)

  return (
    <div style={{
      background: '#070b16', border: '1px solid #1a2a3a',
      borderRadius: 4, padding: 16, width: 300, fontFamily: FONT,
      color: '#ccd', fontSize: 12, position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, color: '#aabbcc', flex: 1, paddingRight: 24 }}>
          {spot.name}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#445566',
          fontSize: 16, cursor: 'pointer', padding: 0, position: 'absolute', top: 12, right: 12,
        }}>✕</button>
      </div>

      {/* Score pair */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <ScoreBox label="LOCATION" score={locScore} />
        <ScoreBox label="CHASE NOW" score={chaseScoreNow} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 10 }}>
        {['info', 'forecast', 'photos'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '4px 0', fontSize: 9, letterSpacing: 1,
            background: tab === t ? '#0d1a2a' : '#060810',
            border: `1px solid ${tab === t ? '#44ddaa44' : '#1a2035'}`,
            color: tab === t ? '#44ddaa' : '#445566',
            cursor: 'pointer', fontFamily: FONT,
          }}>{t.toUpperCase()}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="View" value={spot.view_direction} />
          <Row label="Bortle" value={spot.bortle} />
          <Row label="Horizon" value={'★'.repeat(spot.horizon_rating || 3) + '☆'.repeat(5-(spot.horizon_rating||3))} />
          <Row label="Access" value={spot.access_notes} small />
          <div style={{ marginTop: 6, color: '#334455', fontSize: 9, letterSpacing: 1 }}>
            {spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}
          </div>
        </div>
      )}

      {tab === 'forecast' && (
        <div>
          {loading ? (
            <div style={{ color: '#445566', fontSize: 11, textAlign: 'center', padding: 16 }}>
              Loading forecast...
            </div>
          ) : forecast ? (
            <div>
              <div style={{ color: '#334455', fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                CLOUD COVER · NEXT 8 HRS · {spot.lat.toFixed(2)},{spot.lon.toFixed(2)}
              </div>
              {forecast.slice(0, 9).map((pt, i) => {
                const score = calcChaseScore(pt.cloudcover, spot.bortle)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#445566', fontSize: 9, width: 42 }}>
                      {i === 0 ? 'NOW' : formatTime(pt.time)}
                    </span>
                    <div style={{ flex: 1, height: 8, background: '#0a0e18', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${100 - score*100}%`,
                        background: pt.cloudcover >= 95 ? '#334455' : '#2a4a6a',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <span style={{ color: scoreToColor(score, 1), fontSize: 9, width: 28, textAlign: 'right' }}>
                      {pt.cloudcover}%
                    </span>
                    <span style={{ color: '#334455', fontSize: 9 }}>☁</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ color: '#445566', fontSize: 11, textAlign: 'center', padding: 16 }}>
              Forecast unavailable
            </div>
          )}
        </div>
      )}

      {tab === 'photos' && (
        <div>
          {spot.photos && spot.photos.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {spot.photos.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={p.photo_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 2 }} />
                  <div style={{ color: '#445566', fontSize: 8, marginTop: 2 }}>{p.caption}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#334455', fontSize: 11, textAlign: 'center', padding: 16 }}>
              No photos yet
            </div>
          )}
          <button onClick={() => onSubmitPhoto(spot)} style={{
            marginTop: 8, width: '100%', padding: '6px 0', fontSize: 10,
            background: '#060810', border: '1px solid #1a2a3a',
            color: '#44ddaa', cursor: 'pointer', fontFamily: FONT, letterSpacing: 1,
          }}>
            + SUBMIT A PHOTO
          </button>
        </div>
      )}
    </div>
  )
}

function ScoreBox({ label, score }) {
  const color = scoreToColor(score, 1)
  const pct = Math.round(score * 100)
  return (
    <div style={{
      flex: 1, background: '#060810', border: `1px solid ${color}33`,
      borderRadius: 2, padding: '6px 8px', textAlign: 'center',
    }}>
      <div style={{ color: '#334455', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 'bold' }}>{pct}</div>
      <div style={{ color: color + 'aa', fontSize: 8 }}>{scoreToLabel(score)}</div>
    </div>
  )
}

function Row({ label, value, small }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color: '#334455', fontSize: 9, letterSpacing: 1, width: 52, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: '#aabbcc', fontSize: small ? 10 : 11 }}>{value}</span>
    </div>
  )
}
