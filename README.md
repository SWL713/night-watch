# 🌌 Night Watch

**Aurora hunting app for the Northeast US and Southeast Canada.**  
Real-time space weather, HRRR cloud forecasts, and light pollution mapping — built for the Substorm Society community.

**Live:** [swl713.github.io/night-watch](https://swl713.github.io/night-watch)

---

## What it does

Night Watch combines three data sources on a single map to answer one question: *where should I drive tonight to see the aurora?*

- **Space weather** — live Bz, solar wind speed, Kp index, NOAA geomagnetic alerts, HSS detection, and an Ovation auroral oval overlay updated every 30 minutes
- **Cloud cover** — HRRR model TCDC forecasts updated hourly, showing a 9-hour forecast you can scrub through with the time slider
- **Light pollution** — NASA GIBS VIIRS night light tiles at ~500m resolution, recolored so dark sky is transparent (base map shows through) and light-polluted areas glow orange to red

The three layers are independently toggleable. Combined mode stacks the light pollution tiles with a red cloud overlay — clear dark sky stays transparent, clouds push areas toward red regardless of bortle class.

---

## Map layers

| Button | What it shows |
|--------|--------------|
| **Combined** | VIIRS light pollution tiles + red cloud overlay |
| **Clouds only** | Cloud cover as a red opacity layer — transparent=clear, solid red=overcast |
| **Bortle only** | VIIRS night light tiles only — transparent=dark sky, orange/red=light polluted |
| **Ovation Model** | NOAA Ovation auroral oval for current and forecast hours |
| **Locations** | Community-submitted dark sky spots with cloud-adjusted pin colors |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Leaflet (react-leaflet) |
| Base map | CARTO Dark Matter tiles |
| Light pollution | NASA GIBS VIIRS SNPP DayNightBand ENCC tiles |
| Cloud data | HRRR TCDC via NOMADS byte-range fetch |
| Space weather | NOAA SWPC REST APIs |
| Community spots | Supabase (PostgreSQL + Row Level Security) |
| Photo hosting | Cloudinary |
| Hosting | GitHub Pages (Vite build) |
| Pipeline | GitHub Actions + Python |

---

## Data pipeline

Two GitHub Actions workflows keep the data fresh:

### Space weather (`space_weather.yml`)
- **Every 30 min** during active aurora hours (9pm–1am EDT)
- **Every 60 min** during quiet hours
- Fetches from NOAA SWPC: real-time solar wind, Bz trace, plasma timeline, ENLIL solar wind model, Ovation oval boundaries, 3-day forecast, active alerts
- Outputs `data/space_weather.json`
- ~540 GitHub Actions minutes/month

### Cloud cover (`clouds.yml`)
- **Every hour** during active aurora hours (6pm–4am EDT)
- **Once at noon** EDT for daytime update
- Fetches HRRR GRIB2 TCDC (total cloud cover, entire atmosphere) from NOMADS via byte-range requests — no full GRIB download
- Bilinearly interpolates HRRR's Lambert conformal native grid to a 0.1° lat/lon grid (~12,000 points)
- Applies pipeline-level Gaussian smoothing to remove grid projection artifacts
- Outputs `data/cloud_cover.json` with 9-hour forecasts per grid point
- ~990 GitHub Actions minutes/month

Both workflows use an amend-commit strategy so the repo doesn't accumulate thousands of data commits.

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
│   │   ├── SpotCard.jsx           # Spot popup with forecast
│   │   ├── LayerControls.jsx      # Toggle buttons
│   │   ├── Badges.jsx             # G-storm / HSS / Kp badges
│   │   ├── TimelinePanel.jsx      # Space weather timeline
│   │   ├── TimeSlider.jsx         # Forecast hour scrubber
│   │   ├── OvationLines.jsx       # Auroral oval overlay
│   │   ├── AdminQueue.jsx         # Spot/photo approval queue
│   │   ├── SubmitSpot.jsx         # Community spot submission
│   │   └── SubmitPhoto.jsx        # Aurora photo submission
│   ├── hooks/
│   │   ├── useCloudCover.js       # HRRR data fetch, bilinear interpolation
│   │   ├── useSpaceWeather.js     # Space weather data fetch
│   │   └── useSpots.js            # Supabase spots query
│   └── utils/
│       ├── bortleApi.js           # Auto-fetch bortle via lightpollutionmap API
│       ├── bortleGrid.js          # Bortle JSON grid lookup (spot pin scoring)
│       ├── scoring.js             # Bortle score curves, color scales
│       ├── moon.js                # Moon phase and illumination
│       └── ovation.js             # Oval geometry utilities
├── pipeline/
│   ├── generate_space_weather.py  # Main pipeline: space weather + cloud cover
│   ├── seed_supabase.py           # One-time spot data seeder
│   └── requirements.txt
├── data/
│   ├── space_weather.json         # Updated every 30–60 min by pipeline
│   ├── cloud_cover.json           # Updated hourly by pipeline
│   ├── bortle_grid.json           # Static 0.1° bortle grid (spot scoring)
│   └── spots.json                 # Seed data for Supabase
├── .github/workflows/
│   ├── space_weather.yml
│   ├── clouds.yml
│   └── deploy.yml
└── supabase_schema.sql            # Run once to set up Supabase tables
```

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase project (free tier sufficient)
- Cloudinary account (free tier sufficient)
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
export const PASSPHRASE        = 'your-passphrase'     // App access passphrase
export const SUPABASE_URL      = 'https://xxx.supabase.co'
export const SUPABASE_ANON     = 'your-anon-key'
export const CLOUDINARY_CLOUD  = 'your-cloud-name'
export const CLOUDINARY_PRESET = 'night_watch_unsigned'
```

### 3. Set up Supabase

Run `supabase_schema.sql` in your Supabase SQL editor to create the `spots` and `photos` tables with Row Level Security.

### 4. Seed spots

```bash
pip install -r pipeline/requirements.txt
python pipeline/seed_supabase.py
```

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy

Push to `main` — the deploy workflow builds and publishes to GitHub Pages automatically.

---

## GitHub Actions budget

| Workflow | Frequency | Monthly minutes |
|----------|-----------|----------------|
| Space weather | Every 30–60 min | ~540 |
| Cloud cover | Every 60 min + noon | ~990 |
| Deploy | On src changes | ~30 |
| **Total** | | **~1,560** |

GitHub Free tier provides 2,000 minutes/month — comfortably within budget.

---

## Data sources & attribution

| Source | Data | License |
|--------|------|---------|
| [NOAA SWPC](https://www.swpc.noaa.gov) | Space weather, Kp, alerts, Ovation | Public domain |
| [NCEP NOMADS](https://nomads.ncep.noaa.gov) | HRRR cloud cover forecasts | Public domain |
| [NASA GIBS](https://earthdata.nasa.gov) | VIIRS night light tiles | Public domain |
| [CARTO](https://carto.com) | Dark base map tiles | © CARTO |
| [Supabase](https://supabase.com) | Community spot database | — |

---

## Community features

### Submitting a spot
1. Tap **+ PLACE PIN** in the bottom bar
2. Tap the map at the location
3. Fill in the name, bortle class, view direction, access notes, horizon rating
4. Submit — goes into the admin approval queue

### Submitting a photo
Open any spot pin → tap **📷 Submit Photo** — uploads to Cloudinary with the current space weather conditions snapshot attached.

### Admin queue
Enter the admin passphrase in the bottom bar to access the approval queue for pending spots and photos.

---

## Tuning the light pollution overlay

The VIIRS tile recoloring is controlled by three constants in `HeatmapLayer.jsx`:

```js
const GLOBAL_CEIL = 0.75       // Absolute brightness ceiling for normalization
// Per-tile: cutoff = minLum + (GLOBAL_CEIL - minLum) * 0.32
const intensity = Math.pow(remapped, 1.3)   // Curve steepness — higher = only cities show
d[i+3] = Math.round(intensity * 130)        // Max alpha — lower = more transparent
```

- **Raise `0.32`** → more areas show (lower bortle visible)
- **Lower `0.32`** → fewer areas show (only cities)
- **Lower `1.3` gamma** → gentler curve, mid-range more visible
- **Lower `130` alpha** → everything more transparent

---

## Credits

Built by **Scott W. LeFevre** for the **Substorm Society** aurora hunting community.

Night light data: NASA GIBS VIIRS SNPP (Suomi National Polar-orbiting Partnership satellite).  
Cloud forecasts: NOAA High-Resolution Rapid Refresh (HRRR) model via NCEP NOMADS.  
Space weather: NOAA Space Weather Prediction Center.
