# Night Watch — Developer Chat Handoff
**Date:** 2026-03-30  
**Repo:** https://github.com/SWL713/night-watch  
**Live app:** https://swl713.github.io/night-watch  
**Stack:** React + Leaflet, Vite, GitHub Pages, Supabase, Cloudinary, GitHub Actions  
**Developer:** Scott W. LeFevre

---

## What Night Watch Is
A real-time aurora hunting PWA for chasers in the northeast US. Single-page map app showing:
- Live space weather (Bz, Kp, solar wind, G-scale, HSS)
- HRRR cloud cover forecast with time slider (7 hours forward)
- Sky brightness / light pollution (Lorenz World Atlas 2024)
- Clear Sky Finder mode with custom per-anchor scoring
- Aurora probability oval (NOAA Ovation model)
- Community spot locations with bortle ratings
- Live aurora cameras
- Aurora sighting reports
- Chase quality score (intensity, interference, astro dark %)

---

## Repo Structure
```
src/
  App.jsx                     — root, all state, map container, modals, overlays, keys
  components/
    HeatmapLayer.jsx          — Lorenz sky brightness tiles + HRRR cloud canvas
    ClearSkyLayer.jsx         — clear sky finder canvas (per-anchor percentile scoring)
    OvationLines.jsx          — NOAA aurora oval polyline
    SpotPins.jsx              — community spot markers on map
    SpotCard.jsx              — spot detail popup with forecast
    SubmitSpot.jsx            — add new location form
    SightingLayer.jsx         — aurora sighting reports canvas
    SightingForm.jsx          — submit sighting form
    SightingPopup.jsx         — sighting detail popup
    CameraLayer.jsx           — live camera markers (📹 camera, 🔭 allsky, ✈️ airport)
    CameraPopup.jsx           — camera preview / live stream popup
    CameraSettings.jsx        — camera advisor modal
    Badges.jsx                — NOAA G-scale + HSS badges (top right of map)
    TimelinePanel.jsx         — Bz/solar wind chart with moon/sun lines
    TimeSlider.jsx            — forecast time scrubber (NOW → +8h)
    LayerControls.jsx         — layer toggle buttons (left side)
    MapSearch.jsx             — location search
    AdminQueue.jsx            — spot approval queue
    Auth.jsx                  — admin passphrase authentication
  hooks/
    useSpaceWeather.js        — space weather + Bz data, polls every 15min
    useCloudCover.js          — HRRR cloud forecast hook
                                getCloudAt(lat, lon, hourOffset) — bilinear interp, time-indexed
                                getAvgCloudAt(lat, lon) — bilinear interp on 8h average
                                cloudBounds — derived from actual data points
    useSpots.js               — Supabase spots + sightings CRUD, polls every 2min
    useBzTrace.js             — Bz trace data for timeline
  utils/
    cloudUtils.js             — getAvgCloudForSpot() — plain JS, zero Leaflet imports
                                MUST stay import-free from Leaflet (see arch rules)
    preRenderManager.js       — DORMANT — pre-render system attempted but reverted
                                Keep for reference but nothing imports it
    bortleGrid.js             — bortle grid lookup from local data
    bortleApi.js              — fetchBortleAt() from lightpollutionmap.info
    scoring.js                — combinedScore, locationScore, bortleScore, scoreToColor
    moon.js                   — getMoonData(), moonInterference()
    cameraEngine.js           — calculateCameraSettings(), getTroubleshootingFix()
    clearSkyStats.js          — DORMANT — kept for reference, nothing imports it
  lib/
    supabase.js               — singleton Supabase client
  config.js                   — MAP_BOUNDS, GRID_BOUNDS, PASSPHRASE, etc.
pipeline/
  generate_space_weather.py   — GitHub Actions script: fetches HRRR, Bz, Kp, writes JSON
                                Runs every ~30min via GitHub Actions cron
data/
  space_weather.json          — live space weather (auto-updated by pipeline)
  cloud_cover.json            — HRRR 7-hour cloud forecast grid (~150KB)
  spots.json                  — approved spot locations (cached from Supabase)
public/
  lp_tiles/                   — Lorenz World Atlas 2024 sky brightness tiles
                                z2-7 global, z8 US/Canada only, ~83MB, ~5,826 tiles
                                Cut from world2024.png via tile-pipeline/cut_tiles.py
documents/
  NightWatch_RoadMap.md       — full feature roadmap + deferred items + arch rules
  NightWatch_ChatHandoff.md   — this file
  NightWatch_Handbook.docx
  NightWatch_Quickstart.docx
```

---

## Critical Architecture Rules
**These were learned from a production black-screen crash. Never violate them.**

1. **Components never import from other components.**  
   If two components share logic, it goes in `src/utils/` as plain JS.

2. **ClearSkyLayer.jsx exports ONLY its default component.**  
   No named exports. Ever.

3. **cloudUtils.js must have zero Leaflet imports.**  
   It's imported by SpotPins which also imports Leaflet — cross-importing creates circular deps that Rollup can't resolve and causes a `Cannot access 'x' before initialization` runtime crash with a black screen.

4. **Before touching module boundaries: clean imports as standalone commit, verify build passes, THEN add the feature.**

5. **The `preRenderManager.js` file is dormant.** A pre-render system was attempted (offscreen canvases, requestIdleCallback) but caused severe performance regression on mobile (black screen on pan). Do not re-enable without Web Worker architecture to move rendering off main thread.

---

## Key Data Flows

### Space Weather Pipeline
- GitHub Actions: `generate_space_weather.py` runs every ~30 min
- Fetches: NOAA SWPC Bz/solar wind, Kp, HSS watch, G-scale forecast, aurora oval
- Writes: `data/space_weather.json`
- Hook: `useSpaceWeather.js` polls every 15 min

### Cloud Cover
- Same pipeline fetches HRRR TCDC (total cloud cover)
- Grid: 0.1° spacing, ~11,000 points, northeast US
- Bounds: 38.3-47.7°N, 82.2-67.0°W
- 7 forecast hours, absolute UTC timestamps
- Data format per point: `[{time: Date, timeMs: number, cloudcover: number}, ...]`
- **Time slider fix (important):** uses `firstForecastTime + hourOffset * 3600000`
  NOT `Date.now()` — using Date.now() caused all hours to show identical clouds
  when viewing app after data was fetched
- `getCloudAt(lat, lon, hourOffset)` — bilinear interpolation, hour-indexed
- `getAvgCloudAt(lat, lon)` — bilinear interpolation on 8-hour average
- Timestamps cached as `timeMs` on load to avoid repeated `new Date()` calls

### Sky Brightness (Lorenz)
- David Lorenz World Atlas 2024, self-hosted tiles
- 14 exact zone colors posterized in `cut_tiles.py` before tile cutting
- Color remapping in `HeatmapLayer.jsx`: `lorenzToIntensity()` → warm teal ramp
- Layer: "Sky Brightness", attribution: © David Lorenz (djlorenz.github.io/astronomy/lp)
- Bortle key: vertical, right side, top:150 right:12, hidden when clear sky key shows

### Bortle Lookup
- Primary: `fetchBortleAt()` — lightpollutionmap.info point API
- Fallback: local grid via `getBortle()`
- In SubmitSpot: instant grid result shown, LPM API refines silently after 1s
- In SpotPins/App: grid instant, LPM silent refine

---

## Layer System

### Layer toggles (LayerControls.jsx, state in App.jsx)
- **Cloud Cover** — red wash canvas, time-slider aware
- **Sky Brightness** — Lorenz tiles + bortle key
- **Ovation Model** — NOAA aurora oval
- **Locations** — community spots (SpotPins)
- **Live Cams** — camera markers
- **Active Hunt** — sighting reports

### heatmapMode derivation
```javascript
const heatmapMode = layers.clouds && layers.bortle ? 'combined'
                  : layers.clouds && clearSkyMode  ? 'clouds'
                  : layers.clouds                  ? 'clouds'
                  : layers.bortle || clearSkyMode  ? 'bortle'
                  : null
```
ClearSkyLayer always handles clear sky rendering independently — HeatmapLayer never renders clearsky mode canvas.

### Map overlays (position reference)
- NOAA G badge + HSS badge: `top:12, right:12` (Badges.jsx)
- Bortle key: `top:150, right:12` (only when sky brightness on, no clear sky)
- Clear sky key: `top:150, right: layers.bortle ? 50 : 12`
- Both keys visible simultaneously when both layers active
- Zoom buttons: hidden when sky brightness active (`{!layers.bortle && <ZoomControl/>}`)
- Boundary boxes: Leaflet Rectangle — pink/red for cloud model, teal for clear sky model
- Boundary boxes driven by `cloudBounds` from `useCloudCover` (dynamic from data)

---

## Clear Sky Finder — Full Spec

### Activation
- Cloud icon button in left toolbar
- Auto-turns off cloud cover and sky brightness layers on activate
- One-time intro popup (session storage: `nw_clearsky_seen`)

### Window toggle
- **4H / NEXT:** buttons in header — 4H = next 4 hours, 8H = next 8 hours
- Default: 8H
- Buttons replace the old "TEAL = BEST OPTIONS" subtitle
- `clearSkyWindow` state in App.jsx, passed as `windowHours` prop to ClearSkyLayer

### Scoring algorithm (per-anchor regional percentile)
**7 anchor points, 150-mile radius each:**
- Buffalo (42.9, -78.9), Syracuse (43.0, -76.1), Albany (43.0, -73.8)
- Burlington (44.5, -73.2), Boston (42.4, -71.1), NYC (40.7, -74.0), Philadelphia (39.9, -75.2)

**Per anchor independently:**
1. Collect all grid points within 150mi
2. Compute median cloud cover across windowed forecast hours
3. Calculate p20, p40, p60 thresholds from that anchor's distribution
4. Hard cap p60 at 45% — never show zones above 45% avg cloud
5. Long Shot: if fewer than 5% of anchor's points have median ≤ 45% → anchor is in Long Shot

**Per-pixel rendering:**
- Distance-weighted blend across overlapping anchors (30-mile soft edge, eliminates circle artifacts)
- Normal zones: BEST (alpha 153) / GOOD (95) / FAIR (45) in teal rgb(0,210,160)
- Long Shot zones: only render where anchor is in LS mode AND no normal zone qualifies
- Long Shot color: warm teal rgb(150,210,120) with dashed orange border
- **Normal zones always win — Long Shot NEVER overrides a qualifying normal zone**

**Long Shot trigger for banner/key:**
- Global Long Shot = ALL anchors in Long Shot mode
- Banner: "⚠️ LONG SHOT · HEAVILY CLOUDED REGION" below header
- Key: adds LONG SHOT swatch (dashed orange border, amber teal label) below FAIR

### Key display
- CLEAR SKY header
- BEST / GOOD / FAIR teal swatches always shown
- LONG SHOT swatch added below when global Long Shot active
- Shifts left (right:50) when sky brightness bortle key also visible

### Boundary box
- Teal dashed Leaflet Rectangle around HRRR data bounds
- Label: "CLEAR SKY MODEL BOUNDARY"
- Driven dynamically by `cloudBounds` from hook

### Intro popup message
"Uses custom scoring to rank the clearest locations in your region across the next 4 or 8 hours — showing where your best options are relative to tonight's conditions, not just raw cloud cover."
"Brighter green = better sky. On heavily clouded nights, ⚠️ LONG SHOT highlights the least-bad options available."

---

## Cloud Cover Layer — Full Spec

### Canvas rendering
- Built by `buildCloudGrid(getCloudAt, selectedHour)` in HeatmapLayer
- Gaussian smoothed (sigma=1.5, R=3)
- Ocean mask applied via `COAST_MASK` lookup
- Red wash: transparent=clear → red=cloudy
- Grid cache: only rebuilds when `selectedHour` or `cloudData.fetchedAt` changes
- Combined mode: cloud canvas over Lorenz tiles

### Time slider
- `selectedHour` state: 0 = NOW, 1-8 = hours ahead
- Label shows actual EDT time: "+2h → 02:27 EDT"
- Uses `firstForecastTime + hourOffset * 3600000` as target timestamp

### Boundary box
- Pink/red dashed Leaflet Rectangle
- Label: "CURRENT CLOUD MODEL BOUNDARY"
- Overridden by teal clear sky boundary when clear sky mode active

---

## Admin System
- Passphrase in `config.js` → PASSPHRASE constant
- Admin button visible after auth in action bar
- Approve/reject spots, delete photos, manage queue
- `adminDeleteSpot`, `adminUpdateSpot`, `adminDeletePhoto`, `flagSpot` in useSpots.js

---

## Supabase Tables
- `spots` — community locations (approved/rejected/pending)
- `sightings` — aurora sighting reports
- `live_cams` — camera list with `camera_type` column (camera/allsky/airport)

### Pending SQL (needs to be run in Supabase editor)
```sql
UPDATE spots SET rejected = false WHERE rejected IS NULL;
```

---

## Performance Notes
- **Cloud grid cache:** `gridCacheRef` in HeatmapLayer — memoizes expensive Gaussian smooth
- **Timestamp cache:** `timeMs` stored on each forecast point at load time — avoids repeated `new Date()` in hot render loops
- **longShot:** calculated via `onLongShot` callback from ClearSkyLayer's existing `regionStats` useMemo — not duplicated in App.jsx
- **Pre-render attempt:** REVERTED. Offscreen canvas pre-rendering caused mobile crash. Future attempt needs Web Workers.
- **Known sluggishness:** ClearSkyLayer per-pixel render loop is the main perf bottleneck. On every map move it re-renders W×H pixels with per-pixel anchor distance calculations. Not solved yet.

---

## Roadmap / Pending Features
See `documents/NightWatch_RoadMap.md` for full details. Key items:

### High priority
- **Performance:** ClearSkyLayer per-pixel render needs optimization. Web Worker approach is the right solution — move pixel loop to worker, transfer ImageData back to main thread. Pre-render architecture is designed (preRenderManager.js) but needs Web Worker implementation to avoid blocking main thread.
- **Viewport-relative Long Shot:** When coverage expands nationally, Long Shot percentile should be calculated from points within ~150mi of map center, not grid-wide. See Local Reach spec in roadmap.

### Medium priority  
- **Local Reach mode:** `!` button for viewport-specific Long Shot. Full spec in roadmap — deferred because it needs stable foundation first.
- **Push notifications:** Kp threshold, flare alerts, CME impact, substorm timing, nearby sighting
- **User accounts:** Supabase Auth → private pins → verified spots curation

### Low priority / future
- **National coverage expansion:** Expand HRRR grid to full eastern seaboard or CONUS. Switch to regional-relative scoring. Add anchor points for Chicago, Detroit, Minneapolis etc.
- **4H/8H window:** Currently implemented and working. Future: add 2H option for "going out right now" decisions.

---

## Environment / Secrets
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — GitHub Actions secrets
- `CLOUDINARY_CLOUD` and `CLOUDINARY_PRESET` — in config or env
- GitHub Actions workflows in `.github/workflows/` — pipeline runs + Pages deploy

---

## Tile Pipeline (for reference)
Located in `tile-pipeline/`:
- `cut_tiles.py` — cuts Lorenz world2024.png into xyz tiles with posterize step
- `sample_colors.py` — samples exact Lorenz zone colors (14 colors)
- Output: `public/lp_tiles/{z}/{x}/{y}.png`
- Strategy: z2-7 global, z8 US/Canada only, land tiles only

### Exact Lorenz zone colors
```
rgb( 34,  34,  34) — charcoal       (pristine → transparent)
rgb( 66,  66,  66) — mid grey       (near-pristine → transparent)
rgb( 20,  47, 114) — dark navy      (bortle 1-2 → transparent)
rgb( 33,  84, 216) — medium blue    (bortle 2-3 → faint yellow)
rgb( 15,  87,  20) — dark green     (bortle 3 → visible yellow)
rgb( 31, 161,  42) — bright green   (bortle 4 → yellow)
rgb(110, 100,  30) — olive brown    (bortle 5 → amber)
rgb(184, 166,  37) — tan/yellow     (bortle 6 → amber)
rgb(191, 100,  30) — orange-brown   (bortle 7 → orange)
rgb(253, 150,  80) — orange         (bortle 7-8 → deeper red)
rgb(251,  90,  73) — red-orange     (bortle 8 → red)
rgb(251, 153, 138) — pink           (bortle 9 → pink-red)
rgb(160, 160, 160) — light grey     (city bright → pink-red)
rgb(242, 242, 242) — near white     (city core → pink-red, alpha=153=60%)
```

---

## How to Start a New Session
1. Share this document with the new chat
2. Share the repo zip or direct the assistant to clone from GitHub
3. The assistant should run: `git clone https://github.com/SWL713/night-watch.git` and work from `/tmp/nw-clean` or similar
4. Reference `documents/NightWatch_RoadMap.md` for full deferred feature specs
5. Always verify build passes before moving to next feature
6. Always check module boundaries before any refactor (see arch rules above)
