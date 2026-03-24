// ============================================================
// Night Watch — Configuration
// ============================================================

// -- Passphrase auth -----------------------------------------
// Change PASSPHRASE monthly. Commit the change to rotate access.
// Post new phrase in your Telegram group.
export const PASSPHRASE = 'aurora2026'

// -- Supabase ------------------------------------------------
export const SUPABASE_URL  = 'https://gdzdzfsyvteqihzwsbzx.supabase.co'
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkemR6ZnN5dnRlcWloendzYnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODQ1MTMsImV4cCI6MjA4OTg2MDUxM30.-HTUn2221CrphsSOxZP2YcR3ytXJ_BAi8_A4vlyiGIE'

// -- Cloudinary ----------------------------------------------
// Create free account at cloudinary.com → Dashboard → Cloud Name
export const CLOUDINARY_CLOUD = 'REPLACE_ME_cloudinary_cloud_name'
export const CLOUDINARY_PRESET = 'night_watch_unsigned'

// -- Space weather pipeline output ---------------------------
export const SPACE_WEATHER_URL = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data/space_weather.json'

// -- Map region bounds (Northeast US + SE Canada) ------------
export const MAP_BOUNDS = {
  center: [43.5, -74.5],
  zoom: 7,
  minZoom: 5,
  maxZoom: 12,
}

export const GRID_SPACING = 0.5
export const GRID_BOUNDS  = { minLat: 38.5, maxLat: 47.5, minLon: -82, maxLon: -66 }

// -- Scoring weights -----------------------------------------
export const WEIGHT_CLOUDS = 0.70
export const WEIGHT_BORTLE = 0.30
export const CLOUD_FLOOR_THRESHOLD = 95
