import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js'

export const supabaseReady = !SUPABASE_URL.startsWith('REPLACE_ME')
export const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON) : null
