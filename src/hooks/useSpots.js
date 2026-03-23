import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js'
import spotsData from '../../data/spots.json'

// Use Supabase if configured, otherwise fall back to local JSON
const supabaseReady = !SUPABASE_URL.startsWith('REPLACE_ME')
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

export function useSpots() {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!supabaseReady) {
        // Local JSON fallback — works before Supabase is configured
        setSpots(spotsData.filter(s => s.approved))
        setLoading(false)
        return
      }
      try {
        const { data, error: err } = await supabase
          .from('spots')
          .select('*')
          .eq('approved', true)
          .order('name')
        if (err) throw err
        setSpots(data || [])
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return }
    supabase.from('spots').select('*').eq('approved', false).order('created_at', { ascending: false })
      .then(({ data }) => { setPending(data || []); setLoading(false) })
  }, [])

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

  return { pending, loading, approveSpot, rejectSpot }
}

export async function submitSpot(spotData) {
  if (!supabaseReady) {
    console.warn('Supabase not configured — submission not saved')
    return { error: 'Database not configured yet' }
  }
  const { data, error } = await supabase.from('spots').insert([{
    ...spotData,
    approved: false,
    submitted_by: 'community',
    created_at: new Date().toISOString(),
  }])
  return { data, error }
}

export async function submitPhoto(spotId, photoUrl, caption, conditions) {
  if (!supabaseReady) return { error: 'Database not configured yet' }
  const { data, error } = await supabase.from('photos').insert([{
    spot_id: spotId,
    photo_url: photoUrl,
    caption,
    conditions_snapshot: conditions,
    approved: false,
    created_at: new Date().toISOString(),
  }])
  return { data, error }
}
