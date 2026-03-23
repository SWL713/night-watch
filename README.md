# Night Watch

Aurora hunting map for the Northeast US and Southeast Canada.  
Live heatmap combining cloud cover + Bortle darkness, aurora oval overlay, and space weather panel.

**URL:** https://SWL713.github.io/night-watch/

---

## First-Time Setup (do this once)

### 1. Create the GitHub repo

1. Go to github.com → New repository
2. Name: `night-watch`
3. Public (required for GitHub Pages free tier)
4. Don't initialize with README (you'll push this code)

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/SWL713/night-watch.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Repo → Settings → Pages
2. Source: **GitHub Actions**
3. Save

The deploy workflow will run automatically on every push to main.

### 3. Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Database → SQL Editor → New query
3. Paste contents of `supabase_schema.sql` → Run
4. Settings → API → copy:
   - **Project URL** → paste into `src/config.js` as `SUPABASE_URL`
   - **anon/public key** → paste into `src/config.js` as `SUPABASE_ANON`

### 4. Seed your spots into Supabase

```bash
pip install supabase
export SUPABASE_URL=your_project_url
export SUPABASE_SERVICE_KEY=your_service_role_key   # Settings → API → service_role
python pipeline/seed_supabase.py
```

### 5. Set up Cloudinary (free, for photo uploads)

1. Go to [cloudinary.com](https://cloudinary.com) → Create account
2. Dashboard → Cloud name → paste into `src/config.js` as `CLOUDINARY_CLOUD`
3. Settings → Upload → Add upload preset:
   - Name: `night_watch_unsigned`
   - Signing mode: **Unsigned**
   - Save

### 6. Push config changes

```bash
git add src/config.js
git commit -m "configure credentials"
git push
```

The deploy workflow builds and publishes automatically.

---

## Monthly Passphrase Rotation

1. Open `src/config.js`
2. Change `PASSPHRASE` to a new value
3. Commit and push
4. Post new phrase in your Telegram/Facebook group

Members who visit the site after the push will be prompted for the new phrase.  
Old phrase stops working immediately.

---

## Admin Access

The approval queue for spot and photo submissions is behind a separate admin passphrase.  
To access it:

1. Open the app on any device
2. Type your admin password into the small password field in the bottom bar
3. Press Enter — the QUEUE button appears
4. Review pending spots and photos, approve or reject

To change the admin password: edit `ADMIN_PHRASE` in `src/App.jsx`.

---

## Pipeline

The space weather pipeline runs every 15 minutes via GitHub Actions (free).  
It fetches:
- DSCOVR/WIND L1 solar wind (Bz, speed, density)
- NOAA alerts (G-level, HSS status)
- Moon phase and timing
- ENLIL solar wind forecast (only when CME/HSS active — avoids 174MB download on quiet days)

Output: `data/space_weather.json` — committed to repo, read by the web app.

---

## Architecture

```
night-watch/
├── src/                    # React web app
│   ├── App.jsx             # Main layout, modal management
│   ├── config.js           # All credentials and settings
│   ├── components/
│   │   ├── Auth.jsx        # Passphrase gate
│   │   ├── Badges.jsx      # G + HSS badges (CME Watch style)
│   │   ├── TimelinePanel.jsx  # Top panel with hour-by-hour timeline
│   │   ├── TimeSlider.jsx  # 0-8hr forecast scrubber
│   │   ├── HeatmapLayer.jsx   # Canvas heatmap (Bortle + clouds)
│   │   ├── OvationLines.jsx   # Aurora oval + viewline
│   │   ├── SpotPins.jsx    # Map pins for curated spots
│   │   ├── SpotCard.jsx    # Spot detail popup (info/forecast/photos)
│   │   ├── SubmitSpot.jsx  # Community spot submission form
│   │   ├── SubmitPhoto.jsx # Photo upload form (Cloudinary)
│   │   └── AdminQueue.jsx  # Approval queue
│   ├── hooks/
│   │   ├── useSpaceWeather.js  # Reads pipeline JSON
│   │   ├── useCloudCover.js    # Open-Meteo grid queries
│   │   └── useSpots.js         # Supabase + local JSON fallback
│   └── utils/
│       ├── moon.js         # Moon math (ported from CME Watch)
│       ├── ovation.js      # Ovation Prime aurora boundary
│       └── scoring.js      # Heatmap scoring (Bortle + cloud)
├── pipeline/
│   ├── generate_space_weather.py  # Main pipeline script
│   ├── seed_supabase.py           # One-time spots import
│   └── requirements.txt
├── data/
│   ├── spots.json          # 35 curated spots (local fallback)
│   └── space_weather.json  # Pipeline output (updated every 15min)
├── public/
│   ├── moon/               # 8 moon phase photos
│   └── manifest.json       # PWA config
└── .github/workflows/
    ├── pipeline.yml        # Space weather data (every 15min)
    └── deploy.yml          # Build + deploy to GitHub Pages (on push)
```

---

## Scoring

**Heatmap score = Cloud (70%) + Bortle (30%)**

| Color  | Score | Meaning |
|--------|-------|---------|
| Green  | ≥70   | Clear + dark skies |
| Yellow-green | ≥50 | Good |
| Amber  | ≥35   | Fair |
| Orange | ≥20   | Poor |
| Red    | <20   | Very poor |

**Hard rule:** ≥95% cloud cover floors the score to red regardless of Bortle.

**Spot scoring** shows two separate scores side by side:
- **Location score** — permanent (Bortle + horizon quality)
- **Chase score** — tonight-specific (cloud cover at that exact coordinate)

---

## Adding / Editing Spots

Option A — Supabase dashboard: Database → Table Editor → spots → Insert row  
Option B — Edit `data/spots.json` directly (used as fallback when Supabase is down)

Fields:
- `name` — display name
- `lat`, `lon` — decimal coordinates
- `bortle` — 1-9
- `view_direction` — N, NW, 360, etc.
- `access_notes` — parking/hiking info
- `horizon_rating` — 1-5
- `approved` — true to show on map

---

## Stack

| Service | Purpose | Cost |
|---------|---------|------|
| GitHub Pages | Host web app | Free |
| GitHub Actions | Pipeline + deploy | Free (2000 min/mo) |
| Supabase | Database (spots, photos) | Free (500MB) |
| Cloudinary | Photo storage | Free (25GB) |
| Open-Meteo | Cloud cover forecasts | Free, no key |
| NOAA SWPC | Space weather data | Free, public |
| CartoDB | Dark map tiles | Free |
| Ovation Prime | Aurora oval | Free, NOAA |
