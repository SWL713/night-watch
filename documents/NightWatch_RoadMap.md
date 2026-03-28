# Night Watch — Product Roadmap & Development Plan

## Vision
Transform Night Watch from an aurora hunting helper into a full aurora forecasting and monitoring platform. The header panel and timeline bar remain persistent across all screens. The map area becomes a swappable content zone navigated by a tab bar.

---

## App Structure

### Persistent (always visible)
- Header panel — Bz, intensity, chase quality, moon, astro dark
- Timeline bar — Bz trace, V, n, sun/moon shading, selected hour box
- Action bar — Report Aurora, Place Pin, Admin
- Attribution strip
- Time slider

### Tab Bar (position TBD — above content area or above action bar)
Swaps the content area below the timeline.

---

## Tabs

### 1. Map
- VIIRS light pollution + HRRR cloud overlay
- Ovation oval
- Community location pins with chase scores
- Active Hunt sighting rings
- Search, night vision mode, layer controls
- Action bar fully active here
- **Camera settings** — floating panel (like search), opened via camera button on map
  - Tap camera button → tap map to select location → panel opens
  - Auto-populates: Bortle class, latitude, MLat, aurora intensity, moon up/down, moon illumination
  - User selects: device type (iPhone / Android / DSLR/Mirrorless)
  - iPhone: model dropdown → specs looked up automatically
  - Android: manufacturer + model dropdown → specs looked up automatically; unknown models enter aperture manually
  - DSLR/Mirrorless: sensor size, focal length, max aperture
  - All devices: tripod checkbox; DSLR adds star tracker checkbox
  - Aurora conditions: auto from live data with manual override (Calm→Extreme scale)
  - Output card: ISO, shutter speed, aperture, WB, focus instructions, format, EV (phones), mode, NR off, IS off
  - Creative note: longer exposure = more color/smooth; shorter = more structure/detail
  - Troubleshoot button: symptom checkboxes → personalized fixes based on entered settings
  - Closes with X, map remains underneath

#### Camera Settings Calculation Model

**Shutter speed** = min(star_trailing_limit, aurora_motion_limit)
- Star trailing: 500 / (crop_factor × focal_length) — phones use aurora motion limit only
- With star tracker: multiply star trailing limit × 4
- Aurora motion limits by intensity: Calm=20s, Weak=15s, Mild=10s, Moderate=6s, Strong=4s, Very Strong=2s, Extreme=1s
- Phone caps: iPhone Night Mode 10s max, Android Pro 15s max

**Aperture** — always widest available; note ISO compensation if f/3.5 or f/4

**ISO** — base by sensor tier, then multiply adjustments:
- Base: Full frame modern=1600, APS-C=1000, MFT=800, iPhone 15 Pro=1000, iPhone 13-14 Pro=800, Samsung Ultra/Pixel 8-9=800
- Aperture penalty: f/3.5 → ×1.56, f/4.0 → ×2.0
- Moon >60% illuminated and up → ×0.4
- Moon 25-60% and up → ×0.65
- Bortle 7-9 (urban) → ×0.6
- Latitude >55° → ×0.7, latitude <43° → ×1.5
- Caps: Full frame modern=6400, APS-C=3200, MFT=1600, iPhone Pro=2000, other phone=1600

**White balance by Bortle:**
- Bortle 1-4: 4000K
- Bortle 5-6: 3500K
- Bortle 7-9: 3200K

**Phone specs database (Supabase `camera_profiles` table):**
- iPhone 11-16 Pro with sensor size, aperture, max ISO, ProRAW flag
- Samsung S21-S25 Ultra with aperture, pixel pitch
- Google Pixel 6-9 Pro with aperture, NR capability flag

**Troubleshooting checkboxes (personalized to entered settings):**
- Too dark → raise ISO one stop OR increase shutter 50%
- Too bright → lower ISO one stop OR decrease shutter 30%
- Grainy/noisy → lower ISO one stop, increase shutter to compensate
- Aurora smear/no detail → shorten shutter to intensity motion limit
- Everything blurry → camera shake, use 2s timer
- Stars trailing → shorten to NPF limit (calculated value shown)
- Aurora blurry, stars sharp → aurora moving faster, shorten shutter
- Focus soft → re-focus on brightest star manually

### 2. Space Weather
- CME watch
- Flux rope classifier integrated as callout/badge — not a separate page
- Flare card with current GOES X-ray class
- Recent significant flares table (M and X class highlighted)
- X-ray flux trace
- CME scoreboard — historical prediction accuracy, transparency on track record
- Vertical scroll layout (sections stacked)

### 3. Upstream (ACE / EPAM + STEREO-A)
- **ACE EPAM** — electron and ion flux traces
  - Threshold annotation system — vertical highlighted lines at key flux crossings
  - Aurora-relevant thresholds marked with text labels
  - **Orange alert box at top** when point of interest is active — plain language description
  - Alert clears when flux returns below threshold
  - Multiple alerts stack or show most significant
  - Annotations persist on trace so crossing history is visible
  - Color coded by severity
- **STEREO-A** — upstream solar wind speed, density, Bz-equivalent preview
  - Same threshold annotation and orange alert box system
  - **Missing data handling:**
    - Explicit gap markers on trace
    - "Last known" label with age of most recent valid data
    - Degraded confidence note when data is stale
    - Alert box only fires on fresh data — no false alerts from stale readings
  - 1-4 day advance warning of solar wind structures before L1 arrival

### 4. Forecast (LeFevre Timing Model)
- Complete rebuild — native Night Watch UI, not reusing dashboard card template
- **GOES Hp feed panel** — live magnetometer trace with auto-picked G-points marked directly
  - Small markers / vertical ticks at each detected peak
  - Per-pick confidence indicator (solid = high confidence, hollow = uncertain)
  - Time axis consistent with Night Watch timeline
- **Model output panel** — predicted onset time, deviation/uncertainty window, confidence score
- Visual validation of auto-picks so bad peak selection is immediately obvious
- Runs every 15 min during evening hours via consolidated pipeline

### 5. Live Cams
- Map view with custom camera markers at each cam's geographic location
- Marker shows pointing direction as subtle cone/arc
- Color coded: green pulse = live, gray = offline
- Tap marker → opens YouTube embed in panel below map
- Admin manages cam URLs, locations, pointing direction, and active status via Supabase
- No redeployment needed to add/swap/remove cams

**Live Cam marker design (TBD):**
- Custom lens-style circular marker with live indicator dot
- Pulsing ring when stream is active
- Pointing direction cone showing camera field of view
- Distance from user location on marker

**Cam data model (Supabase):**
- name, lat, lon, pointing_direction, youtube_url, is_active, notes

---

## Action Bar Behavior on Non-Map Tabs
- TBD: hide buttons, change function, or leave visible but inactive
- Map state persists when switching tabs (map stays mounted, not unmounted)

---

## Pipeline Consolidation

### Goal
Merge CME, flare, timing model, and Night Watch pipelines into one GitHub Actions setup. Single `generate_all.py` with tiered scheduling.

### Schedule
- Every 15 min (evening hours) — space weather + LeFevre timing model + G-point detection
- Every 60 min — add HRRR cloud cover
- Once at noon EDT — full run

### Output files
- `data/space_weather.json`
- `data/timing.json`
- `data/clouds.json`
- `data/flares.json`
- `data/cme.json`

### Budget estimate (3,000 min/month plan)
| Workflow | Min/month |
|----------|----------|
| Space weather + timing (every 15 min evenings) | ~900 |
| Clouds HRRR f00-f18 | ~990 |
| CME/flare monitor | ~400 |
| STEREO-A + EPAM | ~200 |
| Deploy + cleanup | ~35 |
| **Total** | **~2,525** |
Headroom: ~475 min/month

---

## Monetization Path

### Phase 1 — Patreon (now, while community is small)
- Voluntary support, no feature gating
- Tier ideas:
  - $3/month — Aurora Watcher (supporter badge, early access)
  - $7/month — Storm Chaser (push notifications when added)
  - $15/month — Substorm Scientist (credits, roadmap input)
- Patreon link in app, no backend work required

### Phase 2 — Stripe subscription (when user base grows)
- Freemium split:
  - Free: map, clouds, light pollution, community spots, Active Hunt, G badge
  - Premium: LeFevre timing model, CME predictor, STEREO-A, flare alerts, push notifications
- ~3% Stripe fee, no platform cut

### Phase 3 — App Store (long term)
- React Native + Expo
- Single codebase for iOS and Android
- Main rebuild work: Leaflet → react-native-maps, canvas layers (HeatmapLayer, SightingLayer)
- PWA with push notifications as intermediate step before native

---

## Push Notification Wishlist

When push notifications are implemented (PWA service worker first, native app later), the opt-in alert types users can subscribe to:

### 1. Kp Threshold Crossing
- User sets their own Kp threshold (e.g. notify me at Kp 5, 6, 7...)
- Alert fires when real-time Kp crosses the threshold going upward
- Include current Bz, V, G-level, and a direct link to the app
- Most-wanted feature — this is what wakes chasers up at 2am

### 2. Major Solar Flare Alert
- X-class and strong M-class flares from NOAA SWPC
- Include flare class, source region, and estimated aurora impact
- Fires within minutes of NOAA issuing the alert
- Educational context: "X2.1 flare detected — watch for CME confirmation in 1-3 days"

### 3. Imminent CME Impact
- Alert when a CME arrival is confirmed imminent (ENLIL model predicts impact within 12h)
- Include predicted Bz range, arrival window, and storm level forecast
- This is the "get ready tonight" notification

### 4. LeFevre Timing Model — Substorm Prediction
- When the timing model flags a high-probability substorm onset window
- Include predicted onset time, confidence level, and viewing conditions at user location
- Premium tier feature — this is the differentiator no other app has
- Requires auto-peak selection improvement before rollout

### 5. Nearby Aurora Report
- When a community sighting ring appears within a user-defined radius (e.g. 50, 100, 200 miles)
- "Aurora being reported 45 miles from you — conditions: Naked Eye, Greens"
- Requires location permission and background geofencing
- Most socially engaging alert — drives community participation

### Implementation Notes
- **PWA Service Workers** — Web Push API works on Android Chrome and Safari 16.4+. Free, no backend cost beyond a push service (Firebase Cloud Messaging free tier handles millions of messages/month)
- **Opt-in per alert type** — users choose which alerts they want, not all-or-nothing
- **Quiet hours** — user-settable window where non-critical alerts are suppressed (e.g. 8am-8pm)
- **Location context** — alerts should include local cloud cover and viewing conditions, not just the space weather event
- **Monetization tie-in** — Kp alerts free, CME + substorm timing + nearby reports = Storm Chaser tier ($7/month)

---

## LeFevre Timing Model — IP Notes
- Preprint establishes priority and timestamp
- Implementation (code) separately copyrightable
- "Powered by the LeFevre substorm timing model" as marketing differentiator
- Auto peak selection improvement needed before wider rollout
- Consider full journal publication to strengthen IP position

---

## User Accounts & Private Pins — National Launch Architecture

This is the foundational infrastructure decision for public launch. Everything else — push notifications, private pins, premium tier, national spots — depends on individual user accounts.

### The Problem with Community Spots at Scale
The current community spots model works for a small trusted group where every submission can be personally vetted. At national scale it becomes untenable:
- Cannot verify safety, legality, or accuracy of thousands of submissions
- Liability risk from promoting dangerous or trespassing locations
- Admin moderation burden grows linearly with user base
- One bad recommendation at scale is a serious problem

### Recommended Architecture: Two-Tier Spots + Private Pins

**Tier 1 — Verified Spots (current community spots, rebranded)**
- Maintained by you and trusted regional contributors
- Clearly labeled as verified/curated
- Small, high-quality, manually vetted
- Substorm Society spots remain here as the seed dataset
- Shown to all users by default

**Tier 2 — Private Pins (new feature)**
- Every user can create unlimited private pins visible only to them
- No moderation, no admin review, no liability
- Stored in Supabase with Row Level Security — `user_id = auth.uid()` isolation
- User owns their data, nobody else sees it
- Optional "share publicly" toggle with explicit disclaimer (feeds a community suggestion queue, not live map)
- Replaces the current Place Pin → admin review flow for most users

### Account System Requirements
Private pins require individual user accounts — the single passphrase model doesn't provide a user identity. This is the foundational unlock for:
- Private pins (user_id per row in Supabase)
- Push notification targeting (send to specific users at their Kp threshold)
- Premium tier billing (Stripe customer tied to account)
- Saved preferences (Kp threshold, quiet hours, home location)
- Sighting history (your sightings, not just same-device localStorage)

**Auth options (simplest to most complex):**
- Supabase Auth with email + password — 2-3 days to implement, free
- Add Sign in with Apple + Google — another 2-3 days, better UX
- Magic link (email only, no password) — simplest possible, Supabase built-in

### Implementation Phases

**Phase 1 — Supabase Auth (prerequisite for everything)**
- Replace shared passphrase with individual email accounts
- Keep passphrase as an invite code / access gate during beta
- Supabase Auth handles tokens, sessions, password reset — zero custom backend
- Estimated effort: 1-2 weeks

**Phase 2 — Private Pins**
- Add `user_id` column to spots table with RLS policy
- New "My Pins" toggle in layer controls — shows only current user's private pins
- Place Pin flow creates private pin immediately (no admin review)
- Private pins show with a different marker style (e.g. outline only, no fill)
- Estimated effort: 1 week

**Phase 3 — Verified Spots Curation**
- Rename current community spots to "Verified Spots"
- Add regional contributor roles in admin system
- Verified spots visible to all, private pins visible only to owner
- Estimated effort: 1 week

**Phase 4 — Push Notifications (depends on Phase 1)**
- Service worker + Web Push API
- Per-user preference storage (Kp threshold, quiet hours, alert types)
- See Push Notification Wishlist section for full alert type spec
- Estimated effort: 3-4 weeks

### Technical Notes — Supabase RLS for Private Pins
```sql
-- Add user_id to spots
ALTER TABLE spots ADD COLUMN user_id uuid REFERENCES auth.users;
ALTER TABLE spots ADD COLUMN is_private boolean DEFAULT false;

-- Private pins: only visible to owner
CREATE POLICY "private pins owner only"
  ON spots FOR SELECT
  USING (
    NOT is_private OR user_id = auth.uid()
  );

-- Insert: user can only create pins for themselves  
CREATE POLICY "users create own pins"
  ON spots FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### Timeline Recommendation
- **Now:** continue with current model for Substorm Society community
- **3-6 months before public launch:** implement Phase 1 + 2 (accounts + private pins)
- **At public launch:** Phase 3 + gradual Phase 4 rollout
- **Post-launch:** push notifications as premium upgrade driver

---

## Open Questions
- Tab bar position: above content area vs above action bar
- Action bar on non-map tabs: hide / repurpose / leave inactive
- Live cam marker final design
- Which aurora live streams to seed as default cams
- Whether CME scoreboard is tab or sub-section of Space Weather tab

---

## Current Status
- Trial rollout to small admin group
- Core features stable and working
- Auto peak selection for timing model needs improvement before wider release
- Patreon page not yet created
