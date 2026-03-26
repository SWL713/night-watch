# 🌌 Night Watch

**Aurora hunting app for the Northeast US and Southeast Canada.**
Real-time space weather, HRRR cloud forecasts, light pollution mapping, and community sighting reports — built for the Substorm Society aurora hunting community.

**Live:** [swl713.github.io/night-watch](https://swl713.github.io/night-watch)

---

## What it does

Night Watch combines five data sources on a single interactive map to answer one question: *where should I drive tonight to see the aurora, and is anyone seeing it right now?*

- **Space weather** — live Bz, solar wind speed and density, Kp index, G-scale storms, NOAA geomagnetic alerts, HSS detection, and an Ovation auroral oval overlay updated every 30–60 minutes
- **Cloud cover** — HRRR model TCDC forecasts updated hourly, showing a 9-hour forecast you can scrub through with the time slider
- **Light pollution** — NASA GIBS VIIRS night light tiles at ~500m resolution, recolored so dark sky is transparent and light-polluted areas glow orange to red
- **Community spots** — curated dark sky viewing locations with cloud-adjusted pin colors, horizon ratings, access notes, and aurora photos
- **Active Hunt sightings** — ephemeral crowdsourced aurora sighting reports with fading 30km rings that expire after 5 hours

---

## Map layers

| Button | What it shows |
|--------|--------------|
| **Combined** | VIIRS light pollution tiles + red cloud overlay |
| **Clouds only** | Cloud cover as a red opacity layer — transparent = clear, solid red = overcast |
| **Bortle only** | VIIRS night light tiles only — transparent = dark sky, orange/red = light polluted |
| **Ovation Model** | NOAA Ovation auroral oval for current conditions |
| **Locations** | Community-submitted dark sky spots with cloud-adjusted pin colors |
| **Active Hunt** | Live aurora sighting reports as fading teal rings |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Leaflet (react-leaflet) |
| Base map | CARTO Dark Matter tiles |
| Light pollution | NASA GIBS VIIRS SNPP DayNightBand ENCC tiles |
| Cloud data | HRRR TCDC via NOMADS byte-range fetch |
| Space weather | NOAA SWPC REST APIs |
| Kp index | NOAA planetary_k_index_1m + noaa-planetary-k-index-forecast |
| Community spots | Supabase (PostgreSQL + Row Level Security) |
| Photo hosting | Cloudinary |
| Hosting | GitHub Pages (Vite build) |
| Pipeline | GitHub Actions + Python |

---

## Data pipeline

Three GitHub Actions workflows keep data fresh:

### Space weather (`space_weather.yml`)
- **Every 30 min** during active aurora hours (9pm–1am EDT)
- **Every 60 min** during quiet hours
- Fetches from NOAA SWPC: real-time solar wind (Bz, V, density), Kp index (1-min observed + 3-hour forecast blocks), ENLIL solar wind model, Ovation oval boundaries, HSS detection with stateful velocity gate
- Outputs `data/space_weather.json`
- ~540 GitHub Actions minutes/month

### Cloud cover (`clouds.yml`)
- **Every hour** during active aurora hours (6pm–4am EDT)
- **Once at noon** EDT for daytime update
- Fetches HRRR GRIB2 TCDC from NOMADS via byte-range requests — no full GRIB download
- Fetches f00–f18 (18-hour forecast horizon) for full overnight coverage from a single noon run
- Bilinearly interpolates HRRR's Lambert conformal native grid to a 0.1° lat/lon grid
- Outputs `data/cloud_cover.json`
- ~990 GitHub Actions minutes/month

### Cloudinary cleanup (`cleanup.yml`)
- **Nightly at 06:00 UTC**
- Queries Supabase for photos marked `deleted=true`, calls Cloudinary delete API, then hard-deletes the Supabase row
- Requires `SUPABASE_SERVICE_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET`, `CLOUDINARY_CLOUD` GitHub Secrets

---

## Repository structure

```
night-watch/
├── src/
│   ├── App.jsx                    # Root app, map setup, layer state
│   ├── config.js                  # Passphrase, Supabase keys, map bounds
│   ├── components/
│   │   ├── HeatmapLayer.jsx       # VIIRS tiles + cloud canvas overlay
│   │   ├── SpotPins.jsx           # Community spot markers
│   │   ├── SpotCard.jsx           # Spot popup with forecast + photos
│   │   ├── LayerControls.jsx      # Toggle buttons
│   │   ├── Badges.jsx             # G-storm / HSS / Kp badges (hour-aware)
│   │   ├── TimelinePanel.jsx      # Space weather header panel
│   │   ├── TimelineBar.jsx        # Interactive timeline with Kp bars
│   │   ├── TimeSlider.jsx         # Forecast hour scrubber
│   │   ├── OvationLines.jsx       # Auroral oval overlay
│   │   ├── MapSearch.jsx          # Nominatim geocoding search
│   │   ├── SightingLayer.jsx      # Canvas-based fading aurora rings
│   │   ├── SightingForm.jsx       # Report aurora sighting form
│   │   ├── SightingPopup.jsx      # Sighting detail popup
│   │   ├── AdminQueue.jsx         # Spot/photo/flagged approval queue
│   │   ├── SubmitSpot.jsx         # Community spot submission
│   │   └── SubmitPhoto.jsx        # Aurora photo submission
│   ├── hooks/
│   │   ├── useBzTrace.js          # Real-time L1 Bz + plasma fetch
│   │   ├── useCloudCover.js       # HRRR data fetch + session cache
│   │   ├── useSpaceWeather.js     # Space weather JSON fetch
│   │   └── useSpots.js            # Supabase spots, photos, sightings
│   └── utils/
│       ├── bortleApi.js           # Auto-fetch bortle via lightpollutionmap API
│       ├── bortleGrid.js          # Bortle JSON grid lookup
│       ├── scoring.js             # Bortle score curves, color scales
│       ├── moon.js                # Moon phase, illumination, altitude, interference
│       └── ovation.js             # Oval geometry utilities
├── pipeline/
│   ├── generate_space_weather.py  # Main pipeline: space weather + cloud cover
│   ├── cloudinary_cleanup.py      # Nightly Cloudinary photo purge
│   ├── seed_supabase.py           # One-time spot data seeder
│   └── requirements.txt
├── data/
│   ├── space_weather.json         # Updated every 30–60 min
│   ├── cloud_cover.json           # Updated hourly
│   ├── bortle_grid.json           # Static 0.1° bortle grid
│   └── spots.json                 # Seed data for Supabase
├── .github/workflows/
│   ├── space_weather.yml
│   ├── clouds.yml
│   ├── cleanup.yml
│   └── deploy.yml
├── supabase_schema.sql            # Run once to set up Supabase tables
└── supabase_sightings.sql         # Run once to add sightings table
```

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase project (free tier)
- Cloudinary account (free tier)
- GitHub repository with Pages enabled

### 1. Clone and install

```bash
git clone https://github.com/SWL713/night-watch.git
cd night-watch
npm install
```

### 2. Configure

Edit `src/config.js`:

```js
export const PASSPHRASE        = 'your-passphrase'
export const SUPABASE_URL      = 'https://xxx.supabase.co'
export const SUPABASE_ANON     = 'your-anon-key'
export const CLOUDINARY_CLOUD  = 'your-cloud-name'
export const CLOUDINARY_PRESET = 'night_watch_unsigned'
```

### 3. Set up Supabase

Run `supabase_schema.sql` and then `supabase_sightings.sql` in your Supabase SQL Editor.

### 4. Set up Cloudinary

- Create free account at cloudinary.com
- Settings → Upload → Upload presets → Add preset
- Name: `night_watch_unsigned`, Signing mode: **Unsigned**

### 5. Add GitHub Secrets

In your repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `CLOUDINARY_CLOUD` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_SECRET` | Cloudinary API secret |

### 6. Seed spots

```bash
pip install -r pipeline/requirements.txt
python pipeline/seed_supabase.py
```

### 7. Run locally

```bash
npm run dev
```

### 8. Deploy

Push to `main` — the deploy workflow builds and publishes to GitHub Pages automatically.

---

## GitHub Actions budget

| Workflow | Frequency | Monthly minutes |
|----------|-----------|----------------|
| Space weather | Every 30–60 min | ~540 |
| Cloud cover | Every 60 min + noon | ~990 |
| Cleanup | Nightly | ~5 |
| Deploy | On src changes | ~30 |
| **Total** | | **~1,565** |

GitHub Free tier: 2,000 minutes/month.

---

## Space weather interpretation

### G-scale (geomagnetic storm)
Derived from real-time Kp index (not forecast text). Updates every pipeline run.

| Kp | G Level | Typical aurora visibility |
|----|---------|--------------------------|
| < 5 | None | High latitudes only |
| 5 | G1 | Northern tier states (Maine, Vermont, Minnesota) |
| 6 | G2 | Mid-latitudes (upstate NY, Michigan) |
| 7 | G3 | Carolinas, Colorado |
| 8 | G4 | Much of CONUS |
| 9 | G5 | Extreme, near-tropical visibility |

### HSS (High Speed Stream)
Stateful detection — activates when a fresh NOAA alert AND solar wind speed ≥ 450 km/s, stays active while speed remains elevated, turns off when speed drops below threshold.

### Intensity labels
Derived from real-time Bz and solar wind parameters using the LeFevre calibration:

| Label | Bz range | Expected visibility |
|-------|----------|-------------------|
| Calm | > −2 nT | Not visible |
| Weak | −2 to −5 | Faint, camera only |
| Mild | −5 to −10 | Naked eye from dark sites |
| Moderate | −10 to −20 | Clear bands and structure |
| Strong | −20 to −30 | Pillars, color, movement |
| Very Strong | −30 to −50 | Multi-color, overhead |
| Extreme | < −50 | Exceptional, rare event |

---

## Community features

### Submitting a spot
1. Tap **+ PLACE PIN** in the bottom bar
2. Tap the map at the location
3. Fill in name, Bortle class, view direction, access notes, horizon rating
4. Submit — goes into the admin approval queue

### Submitting a photo
Open any spot pin → **Photos** tab → **+ SUBMIT A PHOTO** — uploads to Cloudinary with optional name and caption.

### Reporting an aurora sighting
Tap **🌌 REPORT AURORA** in the bottom bar → GPS location pre-filled → check what you're seeing → **CONFIRM SIGHTING**. Sighting appears as a fading teal ring and expires after 5 hours.

### Admin queue
Type the admin passphrase in the bottom bar password field and press GO. A **QUEUE** button appears with three tabs: Spots (pending approvals), Photos (pending approvals), Flagged (community-flagged content).

---

## Tuning the light pollution overlay

In `HeatmapLayer.jsx`:

```js
// Cloud canvas alpha (0.50 = current)
data[idx+3] = Math.round(cf * 0.50 * edgeFade * 255)

// Gaussian smoothing (sigma=1.5, radius=3 = current)
gaussianSmooth(raw, lats.length, lons.length, 1.5, 3)
```

- **Raise cloud alpha** → more aggressive red overlay at low cloud values
- **Lower cloud alpha** → more transparent, less alarming for patchy clouds
- **Raise Gaussian sigma** → more spreading, smoother but bleeds into clear areas
- **Lower Gaussian sigma** → tighter to actual cloud cells

---

## Data sources & attribution

| Source | Data | License |
|--------|------|---------| 
| [NOAA SWPC](https://www.swpc.noaa.gov) | Space weather, Kp, alerts, Ovation | Public domain |
| [NCEP NOMADS](https://nomads.ncep.noaa.gov) | HRRR cloud cover forecasts | Public domain |
| [NASA GIBS](https://earthdata.nasa.gov) | VIIRS night light tiles | Public domain |
| [CARTO](https://carto.com) | Dark base map tiles | © CARTO |
| [Nominatim / OSM](https://nominatim.org) | Geocoding search | ODbL |
| [Supabase](https://supabase.com) | Community database | — |
| [Cloudinary](https://cloudinary.com) | Photo hosting | — |

---

## Credits

Built by **Scott W. LeFevre** for the **Substorm Society** aurora hunting community — 2026.

Night light data: NASA GIBS VIIRS SNPP (Suomi National Polar-orbiting Partnership satellite).
Cloud forecasts: NOAA High-Resolution Rapid Refresh (HRRR) model via NCEP NOMADS.
Space weather: NOAA Space Weather Prediction Center.
Aurora intensity calibration: LeFevre empirical formula.
