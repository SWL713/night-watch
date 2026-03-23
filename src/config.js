// ============================================================
// Night Watch — Configuration
// ============================================================
// Fill in the values marked REPLACE_ME before deploying.
// All GitHub secrets referenced in workflows must match these names.

// -- Passphrase auth -----------------------------------------
// Change PASSPHRASE monthly. Commit the change to rotate access.
// Post new phrase in your Telegram group.
export const PASSPHRASE = 'aurora2026'

// -- Supabase ------------------------------------------------
// Create free account at supabase.com → New Project
// Settings → API → copy Project URL and anon/public key
export const SUPABASE_URL  = 'REPLACE_ME_supabase_project_url'
export const SUPABASE_ANON = 'REPLACE_ME_supabase_anon_key'

// -- Cloudinary ----------------------------------------------
// Create free account at cloudinary.com → Dashboard → Cloud Name
export const CLOUDINARY_CLOUD = 'REPLACE_ME_cloudinary_cloud_name'
export const CLOUDINARY_PRESET = 'night_watch_unsigned' // create unsigned upload preset in Cloudinary settings

// -- Space weather pipeline output ---------------------------
// Raw GitHub URL to your pipeline JSON output file
// Replace YOUR_GITHUB_USERNAME with your actual username
export const SPACE_WEATHER_URL = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data/space_weather.json'

// -- Map region bounds (Northeast US + SE Canada) ------------
export const MAP_BOUNDS = {
  center: [44.5, -73.5],
  zoom: 7,
  minZoom: 5,
  maxZoom: 12,
}

// -- Heatmap grid --------------------------------------------
// Spacing between grid points for cloud cover sampling (degrees)
// 0.5 = ~55km spacing, good balance of detail vs API calls
export const GRID_SPACING = 0.5
export const GRID_BOUNDS  = { minLat: 40, maxLat: 50, minLon: -80, maxLon: -65 }

// -- Scoring weights -----------------------------------------
export const WEIGHT_CLOUDS = 0.70
export const WEIGHT_BORTLE = 0.30
export const CLOUD_FLOOR_THRESHOLD = 95 // % cloud cover that triggers hard penalty
