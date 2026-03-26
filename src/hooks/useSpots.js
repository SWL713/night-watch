import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js'
import spotsData from '../../data/spots.json'

const supabaseReady = !SUPABASE_URL.startsWith('REPLACE_ME')
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

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
        const { data, error: err } = await supabase
          .from('spots')
          .select('*, photos(id, photo_url, caption, photographer_name, flagged, deleted, created_at)')
          .eq('approved', true)
          .order('name')
        if (err) throw err
        // Filter out deleted photos from each spot
        const cleaned = (data || []).map(s => ({
          ...s,
          photos: (s.photos || []).filter(p => !p.deleted),
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
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!supabaseReady) { setLoading(false); return }
    const [spotsRes, photosRes, flaggedRes] = await Promise.all([
      supabase.from('spots').select('*').eq('approved', false).order('created_at', { ascending: false }),
      supabase.from('photos').select('*, spots(name)').eq('approved', false).eq('deleted', false).order('created_at', { ascending: false }),
      supabase.from('photos').select('*, spots(name)').eq('approved', true).eq('flagged', true).eq('deleted', false).order('flagged_at', { ascending: false }),
    ])
    setPending(spotsRes.data || [])
    setPendingPhotos(photosRes.data || [])
    setFlaggedPhotos(flaggedRes.data || [])
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
    await supabase.from('spots').delete().eq('id', id)
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
    pending, pendingPhotos, flaggedPhotos, loading,
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
  }])
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
