"""
Night Watch — Space Weather Pipeline
Generates data/space_weather.json consumed by the web app.
Runs every 15 minutes via GitHub Actions.

Copies logic from CME Watch and LeFevre Substorm Model.
Runs in complete isolation — reads nothing from other repos at runtime.
"""

import json
import math
import logging
import os
import sys
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'space_weather.json')

# ── Data source URLs ─────────────────────────────────────────────────────────
DSCOVR_MAG_URL    = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
DSCOVR_PLASMA_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json'
WIND_URL          = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'
NOAA_ALERTS_URL   = 'https://services.swpc.noaa.gov/products/alerts.json'
OVATION_URL       = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
ENLIL_BASE        = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/wsa_enlil/prod/'
ENLIL_JSON_URL    = 'https://services.swpc.noaa.gov/json/enlil_time_series.json'

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_get(url, timeout=15):
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f'GET {url} failed: {e}')
        return None


def safe_get_bytes(url, timeout=30):
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.content
    except Exception as e:
        log.warning(f'GET bytes {url} failed: {e}')
        return None


# ── L1 Solar Wind ─────────────────────────────────────────────────────────────

def fetch_l1():
    """Fetch real-time L1 solar wind. DSCOVR mag + WIND plasma fallback."""
    mag_data = safe_get(DSCOVR_MAG_URL)
    plasma_data = safe_get(WIND_URL)  # DSCOVR plasma endpoint (rtsw_plasma_1m) removed by NOAA

    if not mag_data:
        log.warning('No mag data available')
        return None

    # Parse mag
    mag_rows = []
    for rec in (mag_data or []):
        t = rec.get('time_tag')
        bz = rec.get('bz_gsm') or rec.get('Bz')
        by = rec.get('by_gsm') or rec.get('By')
        bx = rec.get('bx_gsm') or rec.get('Bx')
        if t and bz is not None:
            mag_rows.append({'time': pd.Timestamp(t, tz='UTC'), 'Bz': float(bz),
                             'By': float(by or 0), 'Bx': float(bx or 0)})

    # Parse plasma
    plasma_rows = []
    for rec in (plasma_data or []):
        t = rec.get('time_tag')
        v = rec.get('proton_speed') if rec.get('proton_speed') is not None else \
            rec.get('speed') if rec.get('speed') is not None else rec.get('V')
        d = rec.get('proton_density') if rec.get('proton_density') is not None else \
            rec.get('density') if rec.get('density') is not None else rec.get('Np')
        if not t: continue
        # Filter NOAA fill values (-9999.9, -99999, etc)
        try: v = float(v) if v is not None and float(v) > 0 and float(v) < 5000 else None
        except: v = None
        try: d = float(d) if d is not None and float(d) > 0 and float(d) < 500 else None
        except: d = None
        if v is not None:  # require at least valid speed
            plasma_rows.append({'time': pd.Timestamp(t, tz='UTC'),
                                'V': v, 'density': d if d is not None else 5.0})

    if not mag_rows:
        return None

    mag_df    = pd.DataFrame(mag_rows).set_index('time').sort_index()
    plasma_df = pd.DataFrame(plasma_rows).set_index('time').sort_index() if plasma_rows else pd.DataFrame()

    # Last 2 hours
    cutoff = pd.Timestamp.now(tz='UTC') - pd.Timedelta(hours=2)
    mag_df = mag_df[mag_df.index > cutoff]

    if mag_df.empty:
        return None

    # Current values (last point)
    bz_now = float(mag_df['Bz'].dropna().iloc[-1]) if not mag_df['Bz'].dropna().empty else 0.0
    by_now = float(mag_df['By'].dropna().iloc[-1]) if not mag_df['By'].dropna().empty else 0.0

    v_now = 450.0
    d_now = 5.0
    if not plasma_df.empty:
        plasma_recent = plasma_df[plasma_df.index > cutoff]
        if not plasma_recent.empty:
            v_now = float(plasma_recent['V'].dropna().iloc[-1]) if not plasma_recent['V'].dropna().empty else 450.0
            d_now = float(plasma_recent['density'].dropna().iloc[-1]) if not plasma_recent['density'].dropna().empty else 5.0

    log.info(f'L1: Bz={bz_now:.1f} By={by_now:.1f} V={v_now:.0f} d={d_now:.1f}')
    return {'bz_now': bz_now, 'by_now': by_now, 'v_kms': v_now, 'density_ncc': d_now,
            'mag_df': mag_df, 'plasma_df': plasma_df, 'last_data_utc': mag_df.index.max().isoformat()}


# ── Intensity calculation (LeFevre calibration) ───────────────────────────────

def compute_intensity(bz, v_kms, density_ncc):
    """
    Ey-proxy based intensity (ported from LeFevre Substorm Timing Model).
    Returns (label, color, ey_adjusted).
    """
    ey_raw = v_kms * bz / 100.0
    pdyn   = 1.67e-6 * density_ncc * v_kms ** 2
    factor = min(1.8, pdyn ** 0.25) if pdyn >= 4.0 else 1.0
    ey_adj = ey_raw * factor if ey_raw < 0 else ey_raw

    BINS = [
        (0,    'Calm',        '#667788'),
        (-25,  'Weak',        '#5599cc'),
        (-55,  'Mild',        '#88cc44'),
        (-75,  'Moderate',    '#ffaa00'),
        (-125, 'Strong',      '#ff6600'),
        (-175, 'Very Strong', '#ff2200'),
        (-1e9, 'Extreme',     '#cc44ff'),
    ]
    for thresh, label, color in BINS:
        if ey_adj >= thresh:
            return label, color, ey_adj
    return 'Calm', '#667788', ey_adj


# ── NOAA Alerts ───────────────────────────────────────────────────────────────

def fetch_noaa_alerts():
    alerts = safe_get(NOAA_ALERTS_URL) or []
    g_level, g_label, hss_active, hss_watch = '', '', False, False

    for alert in alerts:
        msg = alert.get('message', '') + alert.get('product_id', '')
        for g in ['G5','G4','G3','G2','G1']:
            if g in msg and not g_level:
                g_level = g
                g_label = g
                break
        if 'High Speed Stream' in msg or 'HSS' in msg:
            if 'Warning' in msg or 'Watch' in msg:
                hss_watch = True
            if 'in progress' in msg.lower() or 'geomagnetic activity' in msg.lower():
                hss_active = True

    return {'g_level': g_level, 'g_label': g_label, 'hss_active': hss_active, 'hss_watch': hss_watch}


# ── Moon data (ported from render_aurora_card.py) ────────────────────────────

def moon_illumination(dt):
    def jd_val(d):
        y, m = d.year, d.month
        day = d.day + d.hour/24 + d.minute/1440
        if m <= 2: y -= 1; m += 12
        A = int(y/100); B = 2 - A + int(A/4)
        return int(365.25*(y+4716)) + int(30.6001*(m+1)) + day + B - 1524.5

    jd = jd_val(dt)
    T = (jd - 2451545.0) / 36525.0
    r = math.radians

    Ls = (280.46646 + 36000.76983*T) % 360
    Ms = r((357.52911 + 35999.05029*T) % 360)
    sun_lon = (Ls + (1.914602 - 0.004817*T)*math.sin(Ms) + 0.019993*math.sin(2*Ms)) % 360

    Lm = (218.3164477 + 481267.88123421*T) % 360
    Mm = r((134.9633964 + 477198.8675055*T) % 360)
    D  = r((297.8501921 + 445267.1114034*T) % 360)
    moon_lon = (Lm + 6.289*math.sin(Mm) - 1.274*math.sin(2*D-Mm) + 0.658*math.sin(2*D)) % 360

    phase_angle = (moon_lon - sun_lon + 360) % 360
    illumination = (1 - math.cos(r(phase_angle))) / 2
    idx = int((phase_angle + 22.5) / 45) % 8
    names = ['new','waxing_crescent','first_quarter','waxing_gibbous',
             'full','waning_gibbous','last_quarter','waning_crescent']
    labels = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
              'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent']
    return {
        'illumination': round(illumination, 4),
        'phase_angle':  round(phase_angle, 2),
        'phase_name':   names[idx],
        'phase_label':  labels[idx],
        'phase_index':  idx + 1,
    }


def moon_times(dt):
    """Moonrise/moonset for New York — scans 3 days to always find next/current events."""
    NY_LAT, NY_LON = 40.7128, -74.0060
    H0 = -0.583

    def jd_from(d):
        y, m = d.year, d.month
        day = d.day + d.hour/24
        if m <= 2: y -= 1; m += 12
        A = int(y/100); B = 2 - A + int(A/4)
        return int(365.25*(y+4716)) + int(30.6001*(m+1)) + day + B - 1524.5

    def altitude(jd):
        T = (jd - 2451545.0) / 36525
        gmst = (280.46061837 + 360.98564736629*(jd-2451545.0)) % 360
        lst = (gmst + NY_LON) % 360
        r = math.radians
        Lm = (218.3164477 + 481267.88123421*T) % 360
        Mm = r((134.9633964 + 477198.8675055*T) % 360)
        D  = r((297.8501921 + 445267.1114034*T) % 360)
        F  = r((93.2720950  + 483202.0175233*T) % 360)
        eps = 23.439 - 0.013*T
        eLon = r((Lm + 6.289*math.sin(Mm) - 1.274*math.sin(2*D-Mm) +
                  0.658*math.sin(2*D) - 0.214*math.sin(2*Mm)) % 360)
        eLat = r(5.128*math.sin(F))
        ra = math.degrees(math.atan2(
            math.sin(eLon)*math.cos(r(eps)) - math.tan(eLat)*math.sin(r(eps)),
            math.cos(eLon))) % 360
        dec = math.degrees(math.asin(max(-1, min(1,
            math.sin(eLat)*math.cos(r(eps)) + math.cos(eLat)*math.sin(r(eps))*math.sin(eLon)))))
        ha = r((lst - ra) % 360)
        return math.degrees(math.asin(max(-1, min(1,
            math.sin(r(dec))*math.sin(r(NY_LAT)) + math.cos(r(dec))*math.cos(r(NY_LAT))*math.cos(ha)))))

    def jd_to_iso(jd_v):
        jd_v += 0.5; Z = int(jd_v); F = jd_v - Z
        A = Z if Z < 2299161 else Z + 1 + int((Z-1867216.25)/36524.25) - int(int((Z-1867216.25)/36524.25)/4)
        B = A+1524; C = int((B-122.1)/365.25); D2 = int(365.25*C)
        E = int((B-D2)/30.6001)
        day_f = B - D2 - int(30.6001*E) + F
        day = int(day_f); hour = (day_f-day)*24
        month = E-1 if E < 14 else E-13
        year = C-4716 if month > 2 else C-4715
        h = int(hour); mn = int((hour-h)*60)
        return datetime(year, month, day, h, mn, tzinfo=timezone.utc).isoformat()

    # Scan yesterday through tomorrow+1 (72hr window) to catch all crossings
    start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc) - timedelta(days=1)
    base_jd = jd_from(start)
    crossings, prev = [], None
    for step in range(0, 72*6):   # 10-min steps over 72 hours
        frac = step / (24*6)
        jd_t = base_jd + frac
        alt = altitude(jd_t)
        if prev is not None:
            if prev < H0 <= alt:   crossings.append(('rise', jd_t))
            elif prev > H0 >= alt: crossings.append(('set',  jd_t))
        prev = alt

    now_jd = jd_from(dt)

    # Find the most recent past rise (moon_rise = when moon rose, even if before window)
    # and the next set after now
    past_rises = [(k, t) for k, t in crossings if k == 'rise' and t <= now_jd]
    future_sets = [(k, t) for k, t in crossings if k == 'set'  and t > now_jd]
    future_rises = [(k, t) for k, t in crossings if k == 'rise' and t > now_jd]

    # Most recent rise (so we know when moon came up)
    rise = jd_to_iso(past_rises[-1][1]) if past_rises else (
           jd_to_iso(future_rises[0][1]) if future_rises else None)
    # Next set after now
    sset = jd_to_iso(future_sets[0][1]) if future_sets else None

    return rise, sset


# ── Overall quality ───────────────────────────────────────────────────────────

def overall_quality(intensity_label, astro_dark_pct):
    rank = ['Calm','Weak','Mild','Moderate','Strong','Very Strong','Extreme']
    idx = rank.index(intensity_label) if intensity_label in rank else 0
    if idx == 0: return 'POOR', '#ff5566'
    if astro_dark_pct < 30: return 'POOR', '#ff5566'
    if idx == 1 and astro_dark_pct < 60: return 'POOR', '#ff5566'
    if idx <= 2 and astro_dark_pct < 50: return 'FAIR', '#ffcc44'
    if idx <= 2: return 'FAIR', '#ffcc44'
    if idx == 3 and astro_dark_pct >= 50: return 'GOOD', '#44cc88'
    if idx == 3: return 'FAIR', '#ffcc44'
    if idx >= 4 and astro_dark_pct >= 40: return 'EXCELLENT', '#44ffcc'
    return 'GOOD', '#44cc88'


# ── ENLIL extraction ──────────────────────────────────────────────────────────


def fetch_enlil_timeline():
    """
    Fetch ENLIL Earth time series from NOAA services JSON — 1.5MB vs 131MB netCDF.
    Returns list of {time, speed, density} dicts for the next ~12 hours, or [].

    Data source: services.swpc.noaa.gov/json/enlil_time_series.json
    This is the same data that feeds the Earth plots on the SWPC ENLIL animation page.
    Updated once daily at 00Z for ambient runs, on-demand for CME runs.
    """
    try:
        data = safe_get(ENLIL_JSON_URL)
        if not data:
            log.warning('ENLIL: enlil_time_series.json fetch failed')
            return []

        # Structure: list of records, each with time_tag plus Earth/STEREO fields
        # We want Earth (or L1) speed and density for future times only
        now    = datetime.now(timezone.utc)
        cutoff = now + timedelta(hours=13)

        log.info(f'ENLIL JSON: {len(data)} records, keys={list(data[0].keys()) if data else []}')

        timeline = []
        for rec in data:
            t_str = rec.get('time_tag') or rec.get('time') or rec.get('Time')
            if not t_str:
                continue
            try:
                dt = datetime.fromisoformat(t_str.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue

            if dt <= now or dt > cutoff:
                continue

            # Field names vary — try Earth/L1 specific fields first, then generic
            v = (rec.get('speed_earth') or rec.get('v_earth') or rec.get('vel_earth') or
                 rec.get('speed_l1')    or rec.get('v_l1')    or
                 rec.get('speed')       or rec.get('V')        or rec.get('vr_earth'))
            d = (rec.get('density_earth') or rec.get('n_earth') or rec.get('den_earth') or
                 rec.get('density_l1')    or rec.get('n_l1')    or
                 rec.get('density')       or rec.get('N')        or rec.get('np_earth'))

            try:
                v = float(v) if v is not None else None
                d = float(d) if d is not None else None
                if v is not None and (v <= 0 or v > 5000): v = None
                if d is not None and (d <  0 or d > 500):  d = None
            except Exception:
                v = d = None

            if v is not None or d is not None:
                timeline.append({'time': dt.isoformat(), 'speed': v, 'density': d})

        log.info(f'ENLIL: {len(timeline)} future points extracted')
        return timeline[:13]

    except Exception as e:
        log.warning(f'ENLIL JSON fetch failed: {e}')
        import traceback; log.warning(traceback.format_exc())
        return []


# ── Determine pipeline state ──────────────────────────────────────────────────

def fetch_ovation():
    """
    Fetch Ovation Prime aurora forecast and extract boundary/viewline.
    NOAA data uses lon 0-359 (not -180 to 180) — must convert.
    Full northern hemisphere stored so browser can see oval wherever it is.
    """
    data = safe_get(OVATION_URL)
    if not data or 'coordinates' not in data:
        log.warning('Ovation fetch failed or no coordinates')
        return {'oval_boundary': [], 'view_line': [],
                'observation_time': None, 'forecast_time': None}

    coords = data.get('coordinates', [])
    log.info(f'Ovation: {len(coords)} raw entries')

    # Convert 0-359 longitude to -180 to 180
    def norm_lon(lon):
        return lon - 360 if lon > 180 else lon

    # Group by 1-degree longitude bins, northern hemisphere only (lat 30-90)
    lon_groups = {}
    for entry in coords:
        if len(entry) < 3:
            continue
        raw_lon, lat, prob = float(entry[0]), float(entry[1]), float(entry[2])
        if lat < 30 or lat > 90:
            continue
        lon = norm_lon(raw_lon)
        key = round(lon)
        if key not in lon_groups:
            lon_groups[key] = []
        lon_groups[key].append({'lat': lat, 'prob': prob})

    oval_boundary = []
    view_line = []

    for lon_key in sorted(lon_groups.keys()):
        points = lon_groups[lon_key]
        sorted_pts = sorted(points, key=lambda p: p['lat'])

        # Southernmost lat with prob >= 10% = oval boundary
        oval_pt = next((p for p in sorted_pts if p['prob'] >= 10), None)
        if oval_pt:
            oval_boundary.append([oval_pt['lat'], lon_key])

        # Southernmost lat with prob >= 2% = viewline
        view_pt = next((p for p in sorted_pts if p['prob'] >= 2), None)
        if view_pt:
            view_line.append([view_pt['lat'], lon_key])

    log.info(f'Ovation: {len(oval_boundary)} oval pts, {len(view_line)} view pts')
    if oval_boundary:
        lats = [p[0] for p in oval_boundary]
        log.info(f'Oval lat range: {min(lats):.1f} to {max(lats):.1f}')

    return {
        'oval_boundary':    oval_boundary,
        'view_line':        view_line,
        'observation_time': data.get('Observation Time'),
        'forecast_time':    data.get('Forecast Time'),
    }


def determine_state(bz, v_kms, noaa):
    """Simplified state for the map — full state machine lives in CME Watch."""
    g_level = noaa.get('g_level', '')
    hss = noaa.get('hss_active') or noaa.get('hss_watch')
    g_num = int(g_level[1]) if g_level and len(g_level) > 1 else 0

    if g_num >= 3 or bz < -10:     return 'STORM_ACTIVE'
    if g_num >= 1 or bz < -5:      return 'ARRIVED'
    if hss:                          return 'WATCH'
    if bz < -2:                     return 'WATCH'
    return 'QUIET'


# ── Build timeline for app ────────────────────────────────────────────────────

def build_bz_timeline(l1_data):
    """Build 10-point Bz timeline (-1hr to +8hr) for the app timeline panel."""
    if l1_data is None:
        return [None] * 10

    mag_df = l1_data.get('mag_df', pd.DataFrame())
    bz_now = l1_data.get('bz_now', 0)
    timeline = []
    now = datetime.now(timezone.utc)

    for offset in range(-1, 9):
        dt = now + timedelta(hours=offset)
        if offset <= 0:
            # Use observed data
            if not mag_df.empty:
                cutoff = dt - timedelta(minutes=5)
                nearby = mag_df[mag_df.index >= cutoff]
                if not nearby.empty:
                    timeline.append({'offset': offset, 'bz': round(float(nearby['Bz'].iloc[-1]), 1)})
                    continue
        # Future: use current value with simple decay toward 0
        decay = max(0.0, 1 - offset * 0.1) if bz_now < 0 else 1.0
        timeline.append({'offset': offset, 'bz': round(bz_now * decay, 1)})

    return timeline


def build_plasma_timeline(l1_data):
    """Build minute-resolution plasma timeline for the last 6 hours.
    Returns list of {time, speed, density} dicts with ISO timestamps.
    Used by frontend so it never needs CORS to fetch plasma directly.
    Uses 6hr window (not 2hr) because WIND plasma data can be several hours stale."""
    if l1_data is None:
        return []

    plasma_df = l1_data.get('plasma_df', pd.DataFrame())
    if plasma_df.empty:
        return []

    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=6)  # wide window — WIND data can be 3-4hrs stale

    # cutoff is already tz-aware, use directly
    window = plasma_df[plasma_df.index >= cutoff].copy()

    # If still empty (very stale data), just use whatever we have
    if window.empty:
        window = plasma_df.tail(120).copy()
    if window.empty:
        return []

    # Downsample to every 2 minutes to keep JSON small (~60 points)
    window = window.resample('2min').mean().dropna(how='all')

    points = []
    for ts, row in window.iterrows():
        v = row.get('V')
        d = row.get('density')
        # Filter NOAA fill values (-9999 etc)
        if v is not None and not pd.isna(v) and 200 <= float(v) <= 3000:
            v = round(float(v), 0)
        else:
            v = None
        if d is not None and not pd.isna(d) and 0 < float(d) <= 200:
            d = round(float(d), 2)
        else:
            d = None
        if v is not None or d is not None:
            points.append({'time': ts.isoformat(), 'speed': v, 'density': d})

    return points


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    now = datetime.now(timezone.utc)
    log.info(f'Night Watch pipeline starting: {now.isoformat()}')

    # Fetch all data
    l1 = fetch_l1()
    noaa = fetch_noaa_alerts()

    bz_now   = l1['bz_now']   if l1 else 0.0
    v_kms    = l1['v_kms']    if l1 else 450.0
    density  = l1['density_ncc'] if l1 else 5.0

    # Intensity
    intensity_label, intensity_color, ey_adj = compute_intensity(bz_now, v_kms, density)

    # Moon
    moon = moon_illumination(now)
    moon_rise, moon_set = moon_times(now)

    # Sun times for NY (approximate)
    NY_LAT, NY_LON = 40.7128, -74.006
    n = now.timetuple().tm_yday
    B = math.radians(360/365*(n-81))
    eot = 9.87*math.sin(2*B) - 7.53*math.cos(B) - 1.5*math.sin(B)
    decl = math.radians(23.45*math.sin(math.radians(360/365*(n-81))))
    cos_ha = ((-math.sin(math.radians(-0.833)) - math.sin(math.radians(NY_LAT))*math.sin(decl))
              / (math.cos(math.radians(NY_LAT))*math.cos(decl)))
    cos_ha = max(-1.0, min(1.0, cos_ha))
    ha = math.degrees(math.acos(cos_ha))
    noon_utc = (720 - 4*NY_LON - eot) / 60
    ss_hour = noon_utc + ha/15
    sr_hour = noon_utc - ha/15
    today = now.date()
    ss_dt = datetime(today.year, today.month, today.day,
                     int(ss_hour), int((ss_hour%1)*60), tzinfo=timezone.utc)
    tomorrow = today + timedelta(days=1)
    sr2_hour, _ = (noon_utc - ha/15, None)
    sr2_dt = datetime(tomorrow.year, tomorrow.month, tomorrow.day,
                      int(sr2_hour), int((sr2_hour%1)*60), tzinfo=timezone.utc)
    dark_hours = max(0.1, (sr2_dt - ss_dt).total_seconds() / 3600)

    # Moon interference
    moon_up_hours = 0.0
    if moon_rise and moon_set:
        mr_dt = datetime.fromisoformat(moon_rise)
        ms_dt = datetime.fromisoformat(moon_set)
        if ms_dt > mr_dt:
            overlap = max(0, (min(ms_dt, sr2_dt) - max(mr_dt, ss_dt)).total_seconds() / 3600)
        else:
            overlap = max(0, (min(sr2_dt, sr2_dt) - max(ss_dt, ss_dt)).total_seconds() / 3600)
        moon_up_hours = overlap
    elif moon_set:
        ms_dt = datetime.fromisoformat(moon_set)
        moon_up_hours = max(0, (min(ms_dt, sr2_dt) - ss_dt).total_seconds() / 3600)

    interference_pct = min(100, moon['illumination'] * (moon_up_hours / dark_hours) * 100)

    # Astro dark: 0% during day, tapers from sunset→astro twilight and back before sunrise
    # Astronomical twilight = 1.5hr after sunset / before sunrise
    astro_taper_hrs = 1.5
    time_since_sunset  = (now - ss_dt).total_seconds()  / 3600
    time_until_sunrise = (sr2_dt - now).total_seconds() / 3600

    if now < ss_dt or now > sr2_dt:
        # Daytime — hard 0%
        raw_dark_pct = 0.0
    elif time_since_sunset < astro_taper_hrs:
        # Civil/nautical twilight after sunset — taper 0→100% over 1.5hr
        raw_dark_pct = (time_since_sunset / astro_taper_hrs) * 100
    elif time_until_sunrise < astro_taper_hrs:
        # Approaching sunrise — taper 100→0% over 1.5hr
        raw_dark_pct = (time_until_sunrise / astro_taper_hrs) * 100
    else:
        # Deep astronomical darkness
        raw_dark_pct = 100.0

    astro_dark_pct = max(0, round(raw_dark_pct - interference_pct * (raw_dark_pct / 100), 1))

    # Overall quality
    quality_label, quality_color = overall_quality(intensity_label, astro_dark_pct)

    # State
    state = determine_state(bz_now, v_kms, noaa)

    # ENLIL — only fetch when warranted (avoid unnecessary 174MB downloads)
    enlil_active = state in ('ARRIVED', 'STORM_ACTIVE') or noaa.get('hss_active')
    enlil_timeline = fetch_enlil_timeline() if enlil_active else []

    # Bz timeline
    bz_timeline     = build_bz_timeline(l1)
    plasma_timeline = build_plasma_timeline(l1)

    # Build output JSON
    output = {
        'last_updated':       now.isoformat(),
        'state':              state,
        'bz_now':             round(bz_now, 2),
        'by_now':             round(l1['by_now'] if l1 else 0, 2),
        'speed_kms':          round(v_kms, 0),
        'density_ncc':        round(density, 2),
        'ey_adjusted':        round(ey_adj, 2),
        'intensity_label':    intensity_label,
        'intensity_color':    intensity_color,
        'aurora_quality':     quality_label,
        'aurora_quality_color': quality_color,
        'interference_pct':   round(interference_pct, 1),
        'astro_dark_pct':     round(astro_dark_pct, 1),
        'moon_illumination':  moon['illumination'],
        'moon_phase_index':   moon['phase_index'],
        'moon_phase_name':    moon['phase_name'],
        'moon_phase_label':   moon['phase_label'],
        'moon_rise':          moon_rise,
        'moon_set':           moon_set,
        'g_level':            noaa.get('g_level', ''),
        'g_label':            noaa.get('g_label', ''),
        'hss_active':         noaa.get('hss_active', False),
        'hss_watch':          noaa.get('hss_watch', False),
        'enlil_active':       bool(enlil_active),
        'enlil_timeline':     enlil_timeline,
        'timeline':           bz_timeline,
        'plasma_timeline':    plasma_timeline,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    log.info(f'space_weather.json written: state={state} intensity={intensity_label} '
             f'bz={bz_now:.1f} quality={quality_label}')



# ── NDFD Cloud Cover (replaces Open-Meteo) ─────────────────────────────────────
#
# NOAA NDFD sky cover: free, no rate limits, hourly for 3 days then 3-hrly to day 7.
# Northeast sector (AR.neast) covers our full grid at 5km resolution.
# Files are GRIB2, parsed with cfgrib + scipy nearest-neighbour to our 0.25° grid.
#
NDFD_BASE    = 'https://tgftp.nws.noaa.gov/SL.us008001/ST.opnl/DF.gr2/DC.ndfd/AR.neast/'
# Valid-period dirs that cover -1h to +8h from now (conservative — grab first 3 files)
NDFD_PERIODS = ['VP.001-003', 'VP.004-007', 'VP.008-013']

CLOUD_GRID_SPACING = 0.25
CLOUD_GRID_BOUNDS  = {'minLat': 38.5, 'maxLat': 47.5, 'minLon': -82, 'maxLon': -66}
CLOUD_OUTPUT_PATH  = os.path.join(os.path.dirname(__file__), '..', 'data', 'cloud_cover.json')


def build_cloud_grid():
    """Build list of {lat, lon} dicts covering our bounding box at 0.25° spacing."""
    pad  = CLOUD_GRID_SPACING * 2
    grid = []
    lat  = CLOUD_GRID_BOUNDS['minLat'] - pad
    while lat <= CLOUD_GRID_BOUNDS['maxLat'] + pad:
        lon = CLOUD_GRID_BOUNDS['minLon'] - pad
        while lon <= CLOUD_GRID_BOUNDS['maxLon'] + pad:
            grid.append({'lat': round(lat, 2), 'lon': round(lon, 2)})
            lon = round(lon + CLOUD_GRID_SPACING, 2)
        lat = round(lat + CLOUD_GRID_SPACING, 2)
    return grid


def fetch_ndfd_cloud(grid):
    """
    Fetch NOAA NDFD sky cover for the northeast US.
    Returns dict matching cloud_cover.json format: {"lat,lon": [{t, cc}, ...]}
    or None on complete failure (caller should fall back to Open-Meteo).

    Source: tgftp.nws.noaa.gov NDFD neast sector, ds.sky.bin
    7-day forecast, hourly for days 1-3, no rate limits, ~2-5 MB per period file.
    """
    try:
        import cfgrib
        import numpy as np
        from scipy.spatial import KDTree
        import tempfile
    except ImportError as e:
        log.warning(f'NDFD: missing dependency ({e}) — falling back to Open-Meteo')
        return None

    now    = datetime.now(timezone.utc)
    # Collect (valid_datetime, flattened_lats, flattened_lons, flattened_sky%) tuples
    messages = []

    for period in NDFD_PERIODS:
        url = f'{NDFD_BASE}{period}/ds.sky.bin'
        log.info(f'NDFD: fetching {url}')
        try:
            data = safe_get_bytes(url)
            if not data or len(data) < 500:
                log.warning(f'NDFD: empty response for {period}')
                continue

            with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            try:
                datasets = cfgrib.open_datasets(tmp_path)
                for ds in datasets:
                    # valid_time may be a scalar or array
                    vt_raw = ds.valid_time.values
                    vt_list = np.atleast_1d(vt_raw)

                    # Get sky cover array — NDFD uses parameter shortName 'tcc' or 'unknown'
                    sky_var = None
                    for vname in ('tcc', 'unknown', 'TCDC'):
                        if vname in ds:
                            sky_var = ds[vname]
                            break
                    if sky_var is None and len(ds.data_vars) > 0:
                        sky_var = ds[list(ds.data_vars)[0]]
                    if sky_var is None:
                        continue

                    lat_arr = ds.latitude.values   # 2-D (y, x)
                    lon_arr = ds.longitude.values  # 2-D (y, x)
                    sky_arr = sky_var.values        # may be 3-D (time, y, x) or 2-D

                    # Handle both 2-D (single time) and 3-D (multiple times)
                    if sky_arr.ndim == 2:
                        sky_arr = sky_arr[np.newaxis, :, :]   # → (1, y, x)

                    for i, vt_np in enumerate(vt_list):
                        try:
                            vt = pd.Timestamp(vt_np).to_pydatetime().replace(tzinfo=timezone.utc)
                        except Exception:
                            continue
                        offset_hr = (vt - now).total_seconds() / 3600
                        if not (-2 <= offset_hr <= 9):
                            continue
                        sky_2d = sky_arr[i] if i < sky_arr.shape[0] else sky_arr[0]
                        messages.append((
                            vt,
                            lat_arr.flatten(),
                            lon_arr.flatten(),
                            sky_2d.flatten(),
                        ))
            finally:
                os.unlink(tmp_path)

        except Exception as e:
            log.warning(f'NDFD {period} parse error: {e}')
            import traceback; log.warning(traceback.format_exc())
            continue

    if not messages:
        log.warning('NDFD: no valid messages parsed — falling back to Open-Meteo')
        return None

    log.info(f'NDFD: {len(messages)} forecast hours parsed')

    # Build KD-tree from the first message's lat/lon grid
    # (all messages from same sector share the same grid projection)
    _, lat0, lon0, _ = messages[0]
    tree = KDTree(np.column_stack([lat0, lon0]))

    # Query tree once per grid point, reuse index across all times
    grid_lats = np.array([p['lat'] for p in grid])
    grid_lons = np.array([p['lon'] for p in grid])
    _, idxs = tree.query(np.column_stack([grid_lats, grid_lons]))

    results = {}
    for i, pt in enumerate(grid):
        key      = f"{pt['lat']},{pt['lon']}"
        ndfd_idx = idxs[i]
        forecast = []
        for vt, lat_f, lon_f, sky_f in sorted(messages, key=lambda x: x[0]):
            if ndfd_idx >= len(sky_f):
                continue
            cc = sky_f[ndfd_idx]
            if np.isnan(cc) or np.isinf(cc):
                continue
            forecast.append({'t': vt.isoformat(), 'cc': int(np.clip(round(cc), 0, 100))})
        if forecast:
            results[key] = forecast

    log.info(f'NDFD: populated {len(results)}/{len(grid)} grid points')
    return results


def fetch_cloud_batch(points):
    """Fetch cloud cover for up to 100 points in one Open-Meteo call (fallback)."""
    lats = ','.join(str(p['lat']) for p in points)
    lons = ','.join(str(p['lon']) for p in points)
    url = (f'https://api.open-meteo.com/v1/forecast'
           f'?latitude={lats}&longitude={lons}'
           f'&hourly=cloudcover&forecast_days=2&timezone=UTC')
    data = safe_get(url, timeout=20)
    if not data:
        return {}

    responses = data if isinstance(data, list) else [data]
    results = {}
    now = datetime.now(timezone.utc)

    for i, pt in enumerate(points):
        if i >= len(responses):
            break
        d = responses[i]
        if not d or 'hourly' not in d:
            continue
        times  = d['hourly'].get('time', [])
        clouds = d['hourly'].get('cloudcover', [])
        key = f"{pt['lat']},{pt['lon']}"
        forecast = []
        for t_str, cc in zip(times, clouds):
            if cc is None:
                continue
            t = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
            offset_hr = (t - now).total_seconds() / 3600
            if -2 <= offset_hr <= 9:
                forecast.append({'t': t.isoformat(), 'cc': int(cc)})
        if forecast:
            results[key] = forecast
    return results


def fetch_all_cloud_openmeteo(grid):
    """Open-Meteo fallback: fetch cloud cover for entire grid in batches of 100."""
    results = {}
    BATCH = 100
    total = len(grid)
    for i in range(0, total, BATCH):
        batch = grid[i:i+BATCH]
        try:
            batch_results = fetch_cloud_batch(batch)
            results.update(batch_results)
        except Exception as e:
            log.warning(f'Cloud batch {i}–{i+BATCH} failed: {e}')
        pct = min(100, round((i + BATCH) / total * 100))
        log.info(f'  Cloud grid (Open-Meteo fallback): {pct}% ({len(results)}/{total} points)')
        time.sleep(1.0)   # respect rate limit in fallback mode
    return results

def main_with_clouds():
    """Extended main that also fetches cloud cover."""
    import time as _time

    now = datetime.now(timezone.utc)
    log.info(f'Night Watch pipeline starting: {now.isoformat()}')

    # Space weather (existing)
    l1    = fetch_l1()
    noaa  = fetch_noaa_alerts()

    bz_now  = l1['bz_now']       if l1 else 0.0
    v_kms   = l1['v_kms']        if l1 else 450.0
    density = l1['density_ncc']  if l1 else 5.0

    intensity_label, intensity_color, ey_adj = compute_intensity(bz_now, v_kms, density)
    moon        = moon_illumination(now)
    moon_rise, moon_set = moon_times(now)

    NY_LAT, NY_LON = 40.7128, -74.006
    n   = now.timetuple().tm_yday
    B   = math.radians(360/365*(n-81))
    eot = 9.87*math.sin(2*B) - 7.53*math.cos(B) - 1.5*math.sin(B)
    decl = math.radians(23.45*math.sin(math.radians(360/365*(n-81))))
    cos_ha = ((-math.sin(math.radians(-0.833)) - math.sin(math.radians(NY_LAT))*math.sin(decl))
              / (math.cos(math.radians(NY_LAT))*math.cos(decl)))
    cos_ha = max(-1.0, min(1.0, cos_ha))
    ha = math.degrees(math.acos(cos_ha))
    noon_utc = (720 - 4*NY_LON - eot) / 60
    ss_hour  = noon_utc + ha/15
    sr_hour  = noon_utc - ha/15
    today    = now.date()
    ss_dt    = datetime(today.year, today.month, today.day,
                        int(ss_hour), int((ss_hour%1)*60), tzinfo=timezone.utc)
    tomorrow = today + timedelta(days=1)
    sr2_dt   = datetime(tomorrow.year, tomorrow.month, tomorrow.day,
                        int(sr_hour), int((sr_hour%1)*60), tzinfo=timezone.utc)
    dark_hours = max(0.1, (sr2_dt - ss_dt).total_seconds() / 3600)

    moon_up_hours = 0.0
    if moon_rise and moon_set:
        mr_dt = datetime.fromisoformat(moon_rise)
        ms_dt = datetime.fromisoformat(moon_set)
        if ms_dt > mr_dt:
            overlap = max(0, (min(ms_dt, sr2_dt) - max(mr_dt, ss_dt)).total_seconds() / 3600)
        else:
            overlap = max(0, (sr2_dt - ss_dt).total_seconds() / 3600)
        moon_up_hours = overlap
    elif moon_set:
        ms_dt = datetime.fromisoformat(moon_set)
        moon_up_hours = max(0, (min(ms_dt, sr2_dt) - ss_dt).total_seconds() / 3600)

    interference_pct = min(100, moon['illumination'] * (moon_up_hours / dark_hours) * 100)

    # Astro dark: 0% during day, tapers from sunset→astro twilight and back before sunrise
    # Astronomical twilight = 1.5hr after sunset / before sunrise
    astro_taper_hrs = 1.5
    time_since_sunset  = (now - ss_dt).total_seconds()  / 3600
    time_until_sunrise = (sr2_dt - now).total_seconds() / 3600

    if now < ss_dt or now > sr2_dt:
        # Daytime — hard 0%
        raw_dark_pct = 0.0
    elif time_since_sunset < astro_taper_hrs:
        # Civil/nautical twilight after sunset — taper 0→100% over 1.5hr
        raw_dark_pct = (time_since_sunset / astro_taper_hrs) * 100
    elif time_until_sunrise < astro_taper_hrs:
        # Approaching sunrise — taper 100→0% over 1.5hr
        raw_dark_pct = (time_until_sunrise / astro_taper_hrs) * 100
    else:
        # Deep astronomical darkness
        raw_dark_pct = 100.0

    astro_dark_pct = max(0, round(raw_dark_pct - interference_pct * (raw_dark_pct / 100), 1))
    quality_label, quality_color = overall_quality(intensity_label, astro_dark_pct)
    state = determine_state(bz_now, v_kms, noaa)

    enlil_active    = state in ('ARRIVED', 'STORM_ACTIVE') or noaa.get('hss_active')
    enlil_timeline  = fetch_enlil_timeline() if enlil_active else []
    bz_timeline     = build_bz_timeline(l1)
    plasma_timeline = build_plasma_timeline(l1)

    # Ovation Prime aurora model
    ovation = fetch_ovation()

    sw_output = {
        'last_updated':         now.isoformat(),
        'state':                state,
        'bz_now':               round(bz_now, 2),
        'by_now':               round(l1['by_now'] if l1 else 0, 2),
        'speed_kms':            round(v_kms, 0),
        'density_ncc':          round(density, 2),
        'ey_adjusted':          round(ey_adj, 2),
        'intensity_label':      intensity_label,
        'intensity_color':      intensity_color,
        'aurora_quality':       quality_label,
        'aurora_quality_color': quality_color,
        'interference_pct':     round(interference_pct, 1),
        'astro_dark_pct':       round(astro_dark_pct, 1),
        'moon_illumination':    moon['illumination'],
        'moon_phase_index':     moon['phase_index'],
        'moon_phase_name':      moon['phase_name'],
        'moon_phase_label':     moon['phase_label'],
        'moon_rise':            moon_rise,
        'moon_set':             moon_set,
        'g_level':              noaa.get('g_level', ''),
        'g_label':              noaa.get('g_label', ''),
        'hss_active':           noaa.get('hss_active', False),
        'hss_watch':            noaa.get('hss_watch', False),
        'enlil_active':         bool(enlil_active),
        'enlil_timeline':       enlil_timeline,
        'timeline':             bz_timeline,
        'plasma_timeline':      plasma_timeline,
        'ovation_oval':         ovation.get('oval_boundary', []),
        'ovation_viewline':     ovation.get('view_line', []),
        'ovation_obs_time':     ovation.get('observation_time'),
        'ovation_fcst_time':    ovation.get('forecast_time'),
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(sw_output, f, indent=2)
    log.info(f'space_weather.json written: {state} {intensity_label} bz={bz_now:.1f}')

    # Cloud cover grid — NDFD primary, Open-Meteo fallback
    log.info('Fetching cloud cover grid (NDFD)...')
    grid = build_cloud_grid()

    cloud_results = fetch_ndfd_cloud(grid)
    if not cloud_results or len(cloud_results) < len(grid) * 0.5:
        log.warning(f'NDFD returned {len(cloud_results) if cloud_results else 0} points — falling back to Open-Meteo')
        cloud_results = fetch_all_cloud_openmeteo(grid)

    cloud_output = {
        'last_updated': now.isoformat(),
        'spacing':      CLOUD_GRID_SPACING,
        'points':       cloud_results,
    }
    with open(CLOUD_OUTPUT_PATH, 'w') as f:
        json.dump(cloud_output, f, separators=(',', ':'))
    log.info(f'cloud_cover.json written: {len(cloud_results)} points')


if __name__ == '__main__':
    import time
    main_with_clouds()
