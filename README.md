# 🌌 Night Watch

**Aurora hunting app for the Northeast US and Southeast Canada.**
Real-time space weather, HRRR cloud forecasts, light pollution mapping, community sighting reports, and night vision mode — built for the Substorm Society aurora hunting community.

**Live:** [swl713.github.io/night-watch](https://swl713.github.io/night-watch)

---

## What it does

Night Watch combines five data sources on a single interactive map to answer one question: *where should I drive tonight to see the aurora, and is anyone seeing it right now?*

- **Space weather** — live Bz, solar wind speed and density, Kp index, G-scale storms, NOAA geomagnetic alerts, HSS detection, and an Ovation auroral oval overlay updated every 30–60 minutes
- **Cloud cover** — HRRR model TCDC forecasts updated hourly, 18-hour forecast horizon for full overnight coverage from a single noon run
- **Light pollution** — NASA GIBS VIIRS night light tiles recolored so dark sky is transparent and light-polluted areas glow orange to red
- **Community spots** — curated dark sky viewing locations with cloud-adjusted scores, photos, attribution, and a flag system
- **Active Hunt sightings** — ephemeral crowdsourced aurora sighting reports with fading 30km rings that expire after 5 hours

---

## Map layers

| Button | What it shows |
|--------|--------------|
| **Combined** | VIIRS light pollution + red cloud overlay |
| **Clouds only** | Cloud cover only — transparent = clear, solid red = overcast |
| **Bortle only** | VIIRS night light tiles only |
| **Ovation Model** | NOAA Ovation auroral oval |
| **Locations** | Community dark sky spots with cloud-adjusted pin colors |
| **Active Hunt** | Live sighting reports as fading teal rings |

---

## Map controls

| Control | Location | Function |
|---------|----------|----------|
| 🔍 | Top-left of map | Location search via Nominatim / OpenStreetMap |
| 🌙 | Below search | Night vision mode — red/black filter, defaults off |
| G / HSS badges | Top-right | Current storm level; G badge updates per forecast hour |
| +/− zoom | Bottom-right | Standard zoom |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Leaflet (react-leaflet) |
| Base map | CARTO Dark Matter tiles |
| Light pollution | NASA GIBS VIIRS SNPP DayNightBand ENCC tiles |
| Cloud data | HRRR TCDC via NOMADS byte-range fetch (f00–f18) |
| Space weather | NOAA SWPC REST APIs |
| Kp index | NOAA planetary_k_index_1m + noaa-planetary-k-index-forecast |
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
- Outputs `data/space_weather.json` — ~540 min/month

### Cloud cover (`clouds.yml`)
- Every hour active hours + once at noon EDT
- HRRR f00–f18 via NOMADS byte-range, 0.1° grid, σ=1.5 Gaussian smooth
- Cloud overlay: 25% floor, 0.50 alpha
- Outputs `data/cloud_cover.json` — ~990 min/month

### Cloudinary cleanup (`cleanup.yml`)
- Nightly 06:00 UTC — purges photos marked `deleted=true` from Cloudinary and Supabase
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

Run `supabase_schema.sql` then `supabase_sightings.sql` in Supabase SQL Editor.

Set up Cloudinary upload preset named `night_watch_unsigned` with Unsigned signing mode.

Add GitHub Secrets: `SUPABASE_SERVICE_KEY`, `CLOUDINARY_CLOUD`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET`.

```bash
python pipeline/seed_supabase.py
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
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
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

| Label | Bz range |
|-------|---------|
| Calm | > −2 nT |
| Weak | −2 to −5 |
| Mild | −5 to −10 |
| Moderate | −10 to −20 |
| Strong | −20 to −30 |
| Very Strong | −30 to −50 |
| Extreme | < −50 |

---

## Community features

**Spots** — Place Pin → tap map → fill form → admin review.

**Photos** — Spot card → Photos tab → Submit. Compressed to <8MB client-side. Optional photographer name + caption. Community flag (🚩) sends to admin Flagged tab.

**Sightings** — Report Aurora → GPS pre-filled → check observations → Confirm. "Pick different location" lets you report for others. Expires after 5 hours.

**Admin queue** — Enter admin passphrase → GO → QUEUE. Three tabs: Spots, Photos, Flagged. Rejected spots soft-deleted with timestamp.

---

## Night vision mode

🌙 button applies `sepia(1) saturate(5) hue-rotate(295deg) brightness(0.7)` CSS filter to the entire app. Converts all UI elements to deep red/black for dark-adapted field use. Defaults off, not persisted.

---

## Data sources

NOAA SWPC · NCEP NOMADS · NASA GIBS · CARTO · Nominatim/OSM · Supabase · Cloudinary

---

## Credits

Built by **Scott W. LeFevre** for the **Substorm Society** — 2026.
