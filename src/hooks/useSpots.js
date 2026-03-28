import { useState, useEffect } from 'react'
import { supabase, supabaseReady } from '../lib/supabase.js'
import spotsData from '../../data/spots.json'


export function useSpots() {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabaseReady) {
        setSpots(spotsData.filter(s => s.approved))
        setLoading(false)
        return
      }
      try {
        const { data: supabaseSpots, error: err } = await supabase
          .from('spots')
          .select('*')
          .eq('approved', true)
          .eq('rejected', false)
          .order('name')
        if (err) throw err

        // Fetch approved photos — no deleted filter to avoid null column issues
        const { data: photosData, error: photosErr } = await supabase
          .from('photos')
          .select('id, spot_id, photo_url, caption, photographer_name, flagged, deleted, created_at')
          .eq('approved', true)
        if (photosErr) console.warn('Photos fetch error:', photosErr)

        // Attach photos to their spots
        const photosBySpot = {}
        for (const p of photosData || []) {
          if (!photosBySpot[p.spot_id]) photosBySpot[p.spot_id] = []
          photosBySpot[p.spot_id].push(p)
        }
        const cleaned = (supabaseSpots || []).map(s => ({
          ...s,
          photos: photosBySpot[s.id] || [],
        }))
        setSpots(cleaned)
      } catch (e) {
        console.warn('Supabase failed, using local data:', e)
        setSpots(spotsData.filter(s => s.approved))
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { spots, loading, error }
}

export function usePendingSpots() {
  const [pending, setPending] = useState([])
  const [pendingPhotos, setPendingPhotos] = useState([])
  const [flaggedPhotos, setFlaggedPhotos] = useState([])
  const [pendingRemovals, setPendingRemovals] = useState([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!supabaseReady) { setLoading(false); return }

    // Fetch spots, photos, and spot names separately — avoid join syntax
    const [spotsRes, photosRes, flaggedRes, spotNamesRes, sightingsRes] = await Promise.all([
      supabase.from('spots').select('*').eq('approved', false).eq('rejected', false).order('created_at', { ascending: false }),
      supabase.from('photos').select('*').eq('approved', false).eq('deleted', false).order('created_at', { ascending: false }),
      supabase.from('photos').select('*').eq('approved', true).eq('flagged', true).eq('deleted', false).order('flagged_at', { ascending: false }),
      supabase.from('spots').select('id, name'),
      supabase.from('sightings').select('*').eq('removal_requested', true).order('removal_requested_at', { ascending: false }),
    ])

    // Build spot name lookup
    const spotNames = {}
    for (const s of spotNamesRes.data || []) spotNames[s.id] = s.name

    // Attach spot name to photos
    const attachName = p => ({ ...p, spots: { name: spotNames[p.spot_id] || 'Unknown spot' } })

    setPending(spotsRes.data || [])
    setPendingPhotos((photosRes.data || []).map(attachName))
    setFlaggedPhotos((flaggedRes.data || []).map(attachName))
    setPendingRemovals(sightingsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  async function approveSpot(id) {
    if (!supabaseReady) return
    await supabase.from('spots').update({ approved: true }).eq('id', id)
    setPending(prev => prev.filter(s => s.id !== id))
  }

  async function rejectSpot(id) {
    if (!supabaseReady) return
    // Soft delete — flag as rejected with timestamp, keep row for audit history
    await supabase.from('spots')
      .update({ rejected: true, rejected_at: new Date().toISOString() })
      .eq('id', id)
    setPending(prev => prev.filter(s => s.id !== id))
  }

  async function approvePhoto(id) {
    if (!supabaseReady) return
    await supabase.from('photos').update({ approved: true }).eq('id', id)
    setPendingPhotos(prev => prev.filter(p => p.id !== id))
  }

  async function rejectPhoto(id) {
    if (!supabaseReady) return
    await supabase.from('photos').update({ deleted: true }).eq('id', id)
    setPendingPhotos(prev => prev.filter(p => p.id !== id))
  }

  async function deletePhoto(id) {
    if (!supabaseReady) return
    await supabase.from('photos').update({ deleted: true, flagged: false }).eq('id', id)
    setFlaggedPhotos(prev => prev.filter(p => p.id !== id))
  }

  async function dismissFlag(id) {
    if (!supabaseReady) return
    await supabase.from('photos').update({ flagged: false }).eq('id', id)
    setFlaggedPhotos(prev => prev.filter(p => p.id !== id))
  }

  return {
    pending, pendingPhotos, flaggedPhotos, pendingRemovals, loading,
    approveSpot, rejectSpot, approvePhoto, rejectPhoto, deletePhoto, dismissFlag,
  }
}

export async function submitSpot(spotData) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { data, error } = await supabase.from('spots').insert([{
    ...spotData,
    approved: false,
    submitted_by: 'community',
    created_at: new Date().toISOString(),
  }]).select()
  return { data, error }
}

export async function submitPhoto(spotId, photoUrl, caption, photographerName, conditions) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { data, error } = await supabase.from('photos').insert([{
    spot_id: spotId,
    photo_url: photoUrl,
    caption,
    photographer_name: photographerName || null,
    conditions_snapshot: conditions,
    approved: false,
    flagged: false,
    deleted: false,
    created_at: new Date().toISOString(),
  }])
  return { data, error }
}

export async function flagPhoto(id) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { error } = await supabase.from('photos')
    .update({ flagged: true, flagged_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}

// ── Sightings ─────────────────────────────────────────────────────────────────

export function useSightings() {
  const [sightings, setSightings] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!supabaseReady) { setLoading(false); return }
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('sightings')
      .select('*')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
    if (!error) setSightings(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Refresh every 2 minutes to pick up new reports
    const iv = setInterval(load, 2 * 60000)
    return () => clearInterval(iv)
  }, [])

  async function deleteSighting(id) {
    if (!supabaseReady) return
    await supabase.from('sightings').delete().eq('id', id)
    setSightings(prev => prev.filter(s => s.id !== id))
  }

  return { sightings, loading, deleteSighting, reload: load }
}

// ── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = 'nightwatch_my_sightings'

export function getMySubmittedSightings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function addMySubmittedSighting(id) {
  try {
    const ids = getMySubmittedSightings()
    ids.push(id)
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {}
}

function removeMySubmittedSighting(id) {
  try {
    const ids = getMySubmittedSightings().filter(x => x !== id)
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {}
}

export function isMySubmittedSighting(id) {
  return getMySubmittedSightings().includes(id)
}

export async function undoSighting(id) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { error } = await supabase.from('sightings').delete().eq('id', id)
  if (!error) removeMySubmittedSighting(id)
  return { error }
}

export async function requestSightingRemoval(id, comment) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { error } = await supabase.from('sightings')
    .update({
      removal_requested: true,
      removal_comment: comment,
      removal_requested_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error }
}

export async function submitSighting(lat, lon, observations) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const now = new Date()
  const expires = new Date(now.getTime() + 5 * 3600000)
  const { data, error } = await supabase.from('sightings').insert([{
    lat, lon, observations,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }]).select()
  if (!error && data?.[0]?.id) {
    addMySubmittedSighting(data[0].id)
  }
  return { data, error }
}
