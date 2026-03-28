# 🌌 Night Watch

**Aurora hunting app for the Northeast US and Southeast Canada.**
Real-time space weather, HRRR cloud forecasts, light pollution mapping, community sighting reports, live camera network, camera settings advisor, and clear sky finder — built for the Substorm Society aurora hunting community.

**Live:** [swl713.github.io/night-watch](https://swl713.github.io/night-watch)

---

## What it does

Night Watch combines multiple data sources on a single interactive map to answer one question: *where should I drive tonight to see the aurora, and is anyone seeing it right now?*

- **Space weather** — live Bz, solar wind speed and density, Kp index, G-scale storms, NOAA geomagnetic alerts, HSS detection, and an Ovation auroral oval overlay updated every 30–60 minutes
- **Cloud cover** — HRRR model TCDC forecasts updated hourly, 18-hour forecast horizon for full overnight coverage
- **Light pollution** — NASA GIBS VIIRS night light tiles recolored so dark sky is transparent and light-polluted areas glow orange to red
- **Community spots** — curated dark sky viewing locations with cloud-adjusted scores, aurora photos, and directions
- **Active Hunt sightings** — ephemeral crowdsourced aurora sighting reports with fading 30km rings that expire after 5 hours
- **Live Cams** — 16+ aurora webcams across the Northeast US, Canada, and beyond as map markers with snapshot previews and Watch Live links
- **Clear Sky Finder** — 8-hour average cloud heatmap showing the best opportunity windows across the region

---

## Map layers

| Button | What it shows |
|--------|--------------|
| **Clouds** | HRRR cloud cover for selected hour — transparent = clear, red = overcast |
| **Bortle** | VIIRS night light tiles — transparent = dark sky, orange/red = light polluted |
| **Ovation Model** | NOAA Ovation auroral oval |
| **Locations** | Community dark sky spots, color-coded by chase score |
| **Live Cams** | Aurora webcam markers — tap for snapshot + Watch Live |
| **Active Hunt** | Live sighting reports — fading teal rings, expire in 5 hours |

Both Clouds and Bortle are on by default. When both are active they render as a combined overlay. Toggle either off independently for clouds-only or bortle-only view.

---

## Map controls

| Control | Location | Function |
|---------|----------|----------|
| 🔍 | Top-left of map | Location search via Nominatim / OpenStreetMap |
| 🌙 | Below search | Night vision mode — red filter, defaults off |
| 📷 | Below moon | Camera settings advisor |
| ☁️ | Below camera | Clear sky finder — 8-hour average cloud heatmap |
| G / HSS badges | Top-right | Current storm level |
| +/− zoom | Bottom-right | Standard zoom |

---

## Clear Sky Finder

Tap the ☁️ button to activate Clear Sky Finder mode. A teal heatmap overlay appears showing which regions have the clearest average skies across the next 8 hours. Activating it automatically turns off the Clouds and Bortle layers to reduce clutter.

The spot pins switch to a cloud-only color mode: teal = consistently clear 8-hour average, red = mostly clouded in. Bortle class is not a factor in this mode.

**Pairing with the Clouds layer:** Turn Clouds back on while Clear Sky Finder is active to compare the 8-hour opportunity zones (teal heatmap) against the current hourly snapshot (red overlay) as you scrub the time slider. The colors are intentionally distinct — teal = where you have a good window, red = what is in the way right now.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Leaflet (react-leaflet) |
| Base map | CARTO Dark Matter tiles |
| Light pollution | NASA GIBS VIIRS SNPP DayNightBand ENCC tiles |
| Cloud data | HRRR TCDC via NOMADS byte-range fetch (f00–f18) |
| Space weather | NOAA SWPC REST APIs |
| Geocoding | Nominatim / OpenStreetMap |
| Community data | Supabase (PostgreSQL + Row Level Security) |
| Photo hosting | Cloudinary (unsigned upload, client-side compression) |
| Hosting | GitHub Pages (Vite build) |
| Pipeline | GitHub Actions + Python |

---

## Data pipeline

### Space weather (`space_weather.yml`)
- Every 30 min active hours / 60 min quiet hours
- Fetches: Bz, V, density, 1-min Kp, 3-hour Kp forecast, ENLIL (cached between daily runs), Ovation oval, stateful HSS detection (V ≥ 450 km/s gate)
- ~540 min/month

### Cloud cover (`clouds.yml`)
- Every hour active hours + once at noon EDT
- HRRR f00–f18 via NOMADS byte-range, 0.1° grid, σ=1.5 Gaussian smooth
- ~990 min/month

### Cloudinary cleanup (`cleanup.yml`)
- Nightly 06:00 UTC — purges photos marked `deleted=true`
- Requires: `SUPABASE_SERVICE_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET`, `CLOUDINARY_CLOUD`

**Total budget: ~1,565 min/month** (GitHub Free: 2,000)

---

## Setup

### Prerequisites
Node.js 18+, Python 3.11+, Supabase project, Cloudinary account, GitHub Pages enabled.

### Steps

```bash
git clone https://github.com/SWL713/night-watch.git
cd night-watch
npm install
```

Edit `src/config.js` with your Supabase URL, anon key, Cloudinary cloud name and preset.

Run in Supabase SQL Editor in this order:
1. `supabase_schema.sql`
2. `supabase_sightings.sql`
3. `supabase_camera_profiles.sql`
4. `supabase_sightings_removal.sql`
5. `supabase_live_cams.sql`

Set up Cloudinary upload preset named `night_watch_unsigned` with Unsigned signing mode.

Add GitHub Secrets: `SUPABASE_SERVICE_KEY`, `CLOUDINARY_CLOUD`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET`.

```bash
npm run dev
```

Push to `main` to deploy automatically.

### Database migration (upgrading from earlier version)

```sql
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS photographer_name text,
  ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS rejected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE sightings
  ADD COLUMN IF NOT EXISTS removal_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS removal_comment text,
  ADD COLUMN IF NOT EXISTS removal_requested_at timestamptz;

ALTER TABLE live_cams
  ADD COLUMN IF NOT EXISTS image_url text;
```

---

## Space weather reference

### G-scale

| Kp | G Level | Visibility |
|----|---------|-----------|
| < 5 | None | High latitudes only |
| 5 | G1 | ME, VT, MN |
| 6 | G2 | Upstate NY, Michigan |
| 7 | G3 | Carolinas, Colorado |
| 8 | G4 | Much of CONUS |
| 9 | G5 | Near-tropical |

### Intensity labels

| Label | Bz (nT) |
|-------|---------|
| Calm | > −2 |
| Weak | −2 to −5 |
| Mild | −5 to −10 |
| Moderate | −10 to −20 |
| Strong | −20 to −30 |
| Very Strong | −30 to −50 |
| Extreme | < −50 |

---

## Community features

**Spots** — Place Pin → crosshair cursor → tap map → fill form → admin review. Bortle auto-detected from bortle grid on coordinate entry with manual override. Optional address for directions. Optional photo at submission time.

**Photos** — Spot card → Photos tab → Submit. Compressed to <8MB client-side. Community flag sends to admin Flagged tab.

**Sightings** — Report Aurora → GPS pre-filled → check observations → Confirm. Same-device undo is immediate; different-device removal goes to admin with required comment.

**Admin queue** — Four tabs: Spots, Photos, Flagged, Sightings. Orange badge appears before login when items are waiting. All destructive actions require confirmation.

---

## Live Cams

Cameras stored in Supabase `live_cams` table. Toggle Live Cams layer to show 📹 markers. Tap any marker for a refreshing snapshot (every 60s) and Watch Live button.

To add a camera: insert a row with name, lat, lon, embed_url, image_url, type (`youtube` or `iframe`), `is_active = true`. No code deploy needed.

YouTube embed URL format: `https://www.youtube.com/embed/VIDEO_ID?si=XXXXX&autoplay=1&mute=1`
allskycam.com image URL format: `http://www.allskycam.com/u/USER_ID/latest_full6.jpg`
Allsky software image URL format: `https://DOMAIN/allsky/image.jpg`

---

## Camera Settings Advisor

Tap 📷 → tap shooting location → panel opens with auto-populated Bortle, latitude, moon conditions, and live aurora intensity. Supports iPhone, Android, and DSLR/Mirrorless with device-specific spec lookup. Override any condition manually. Troubleshooter generates personalized fixes from symptom checkboxes.

**Shutter** = min(star trailing limit, aurora motion limit). Motion limits: Calm=20s → Extreme=1s
**ISO** = base by sensor × aperture penalty × moon penalty × light pollution × latitude factor
**WB**: Bortle 1–4 = 4000K, 5–6 = 3500K, 7–9 = 3200K

---

## Night vision mode

🌙 applies red CSS filter to entire app. Defaults off every page load. Peru, NY easter egg: search Peru, NY for hot pink mode 🎉

---

## Data sources

NOAA SWPC · NCEP NOMADS · NASA GIBS · CARTO · Nominatim/OSM · Supabase · Cloudinary

---

## Credits

Built by **Scott W. LeFevre** for the **Substorm Society** — 2026.
