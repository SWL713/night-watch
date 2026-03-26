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

OUTPUT_PATH       = os.path.join(os.path.dirname(__file__), '..', 'data', 'space_weather.json')
CLOUD_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'cloud_cover.json')

# ── Data source URLs ─────────────────────────────────────────────────────────
DSCOVR_MAG_URL    = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
DSCOVR_PLASMA_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json'
WIND_URL          = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'
NOAA_ALERTS_URL   = 'https://services.swpc.noaa.gov/products/alerts.json'
NOAA_FORECAST_URL = 'https://services.swpc.noaa.gov/text/3-day-forecast.txt'
OVATION_URL       = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
ENLIL_BASE        = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/wsa_enlil/prod/'
ENLIL_JSON_URL    = 'https://services.swpc.noaa.gov/json/enlil_time_series.json'
KP_1M_URL         = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'
KP_FORECAST_URL   = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'

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

def kp_to_g(kp):
    """Convert Kp float to NOAA G-scale string. Returns '' if below G1 threshold."""
    if kp is None: return ''
    if kp >= 9.0: return 'G5'
    if kp >= 8.0: return 'G4'
    if kp >= 7.0: return 'G3'
    if kp >= 6.0: return 'G2'
    if kp >= 5.0: return 'G1'
    return ''


def fetch_kp_data():
    """
    Fetch real-time and forecast Kp from NOAA.

    Observed (1-min): planetary_k_index_1m.json — last ~3h at 1-min resolution.
    Forecast: noaa-planetary-k-index-forecast.json — 3-hour blocks, obs + predicted.

    Returns dict with:
      kp_observed: [{time, kp}] past 3h at 1-min (for bar graph)
      kp_forecast: [{time, kp, g}] all blocks including future (for scrubbing)
      kp_now: float — most recent completed 3-hour observed block value
      g_now: str — G level from kp_now
    """
    now = datetime.now(timezone.utc)
    cutoff_past = now - timedelta(hours=3)
    cutoff_future = now + timedelta(hours=9)

    # ── 1-min observed Kp ─────────────────────────────────────────────────────
    kp_observed = []
    try:
        data = safe_get(KP_1M_URL)
        if data:
            for rec in data:
                t_str = rec.get('time_tag')
                kp_val = rec.get('kp_index') or rec.get('kp') or rec.get('Kp')
                if not t_str or kp_val is None:
                    continue
                try:
                    dt = datetime.fromisoformat(str(t_str).replace('Z', '+00:00'))
                    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                    kp_f = float(kp_val)
                    if dt >= cutoff_past:
                        kp_observed.append({'time': dt.isoformat(), 'kp': round(kp_f, 2)})
                except Exception:
                    continue
            kp_observed.sort(key=lambda x: x['time'])
            log.info(f'Kp 1m: {len(kp_observed)} observed points in past 3h')
    except Exception as e:
        log.warning(f'Kp 1m fetch failed: {e}')

    # ── 3-hour forecast/observed blocks ───────────────────────────────────────
    kp_forecast = []
    kp_now = None
    try:
        data = safe_get(KP_FORECAST_URL)
        if data and len(data) > 1:
            # First row is headers: ["time_tag","kp","observed","noaa_scale"]
            headers = [h.lower() for h in data[0]]
            ti = headers.index('time_tag') if 'time_tag' in headers else 0
            ki = next((i for i, h in enumerate(headers) if 'kp' in h), 1)
            oi = headers.index('observed') if 'observed' in headers else 2
            last_observed_kp = None
            for row in data[1:]:
                try:
                    t_str = row[ti]
                    dt = datetime.fromisoformat(str(t_str).replace('Z', '+00:00'))
                    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                    kp_f = float(row[ki])
                    obs_flag = str(row[oi]).lower() if len(row) > oi else ''
                    is_observed = obs_flag in ('observed', 'estimated')
                    g = kp_to_g(kp_f)
                    kp_forecast.append({
                        'time': dt.isoformat(), 'kp': round(kp_f, 2),
                        'g': g, 'observed': is_observed,
                    })
                    # kp_now = most recent completed 3-hour observed block
                    if is_observed and dt <= now:
                        last_observed_kp = kp_f
                except Exception:
                    continue
            if last_observed_kp is not None:
                kp_now = round(last_observed_kp, 2)
            log.info(f'Kp forecast: {len(kp_forecast)} blocks, kp_now={kp_now}')
    except Exception as e:
        log.warning(f'Kp forecast fetch failed: {e}')

    g_now = kp_to_g(kp_now) if kp_now is not None else ''
    return {
        'kp_observed': kp_observed,
        'kp_forecast': kp_forecast,
        'kp_now': kp_now,
        'g_now': g_now,
    }


def fetch_noaa_alerts():
    """
    HSS detection only — G level now comes from real-time Kp via fetch_kp_data().
    HSS is stateful: turns on with fresh alert + V≥450, stays on until V<450,
    requires fresh alert + V≥450 to re-arm. Alert expiry = 24 hours.
    """
    hss_alert_fresh = False
    hss_watch = False

    try:
        alerts = safe_get(NOAA_ALERTS_URL) or []
        now = datetime.now(timezone.utc)
        for alert in alerts:
            # Check alert age — ignore if > 24h old
            issue_str = alert.get('issue_datetime') or alert.get('issue_time') or ''
            if issue_str:
                try:
                    issue_dt = datetime.fromisoformat(str(issue_str).replace('Z', '+00:00'))
                    if issue_dt.tzinfo is None: issue_dt = issue_dt.replace(tzinfo=timezone.utc)
                    if (now - issue_dt).total_seconds() > 86400:
                        continue  # skip stale alerts
                except Exception:
                    pass

            msg = (alert.get('message', '') + alert.get('product_id', '')).lower()
            hss_signal = ('high speed stream' in msg or ' hss' in msg or
                          'coronal hole' in msg or 'ch hss' in msg)
            if hss_signal:
                if any(x in msg for x in ['in progress', 'geomagnetic activity', 'arrival', 'arrived']):
                    hss_alert_fresh = True
                if any(x in msg for x in ['warning', 'watch', 'expected', 'likely', 'anticipated']):
                    hss_watch = True
    except Exception as e:
        log.warning(f'alerts.json fetch failed: {e}')

    return {'hss_alert_fresh': hss_alert_fresh, 'hss_watch': hss_watch}


def compute_hss_active(v_kms, noaa, prev_json):
    """
    Stateful HSS active flag:
    - ON:      fresh alert AND V >= 450
    - STAYS:   V >= 450 (latched, no alert needed)
    - OFF:     V < 450
    - RE-ARM:  needs fresh alert AND V >= 450 again
    """
    HSS_V_THRESHOLD = 450
    prev_active = False
    try:
        if prev_json:
            prev_active = bool(prev_json.get('hss_active', False))
    except Exception:
        pass

    hss_alert_fresh = noaa.get('hss_alert_fresh', False)
    v_sufficient    = (v_kms or 0) >= HSS_V_THRESHOLD

    if prev_active:
        # Stay on as long as V is sufficient — turns off when V drops
        new_active = v_sufficient
    else:
        # Off — need fresh alert AND sufficient V to turn on
        new_active = hss_alert_fresh and v_sufficient

    log.info(f'HSS: prev={prev_active} alert={hss_alert_fresh} V={v_kms} -> active={new_active}')
    return new_active


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
    Fetch ENLIL Earth time series from NOAA services JSON and merge with cached data.

    The ENLIL model runs once daily at 00Z (more often for CME events), so a single
    run may produce all its forecast points clustered many hours out.  We cache the
    full set in space_weather.json and carry forward any points still in the future
    on each pipeline run, so the +8h browser window stays populated between model runs.

    Data source: services.swpc.noaa.gov/json/enlil_time_series.json
    Updated once daily at 00Z for ambient runs, on-demand for CME runs.
    """
    now    = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=9)   # slightly beyond the +8h browser window

    # ── Load cached points from previous run ─────────────────────────────────
    cached = []
    try:
        with open(OUTPUT_PATH) as f:
            prev = json.load(f)
        for p in prev.get('enlil_timeline', []):
            t_str = p.get('time')
            if not t_str:
                continue
            try:
                dt = datetime.fromisoformat(t_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if now < dt <= cutoff:
                cached.append({'time': dt.isoformat(), 'speed': p.get('speed'), 'density': p.get('density')})
        log.info(f'ENLIL cache: {len(cached)} still-future points carried forward')
    except Exception:
        pass  # first run or file missing

    # ── Fetch fresh ENLIL data ────────────────────────────────────────────────
    fresh = []
    try:
        data = safe_get(ENLIL_JSON_URL)
        if not data:
            log.warning('ENLIL: enlil_time_series.json fetch failed — using cache only')
        else:
            log.info(f'ENLIL JSON: {len(data)} records, keys={list(data[0].keys()) if data else []}')
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

                # Field names confirmed from live log 2026-03-24:
                # keys=['time_tag','earth_particles_per_cm3','temperature',
                #       'v_r','v_theta','v_phi','b_r','b_theta','b_phi','polarity','cloud']
                v = (rec.get('v_r') or rec.get('speed_earth') or rec.get('v_earth') or
                     rec.get('vel_earth') or rec.get('speed_l1') or rec.get('speed') or rec.get('V'))
                d = (rec.get('earth_particles_per_cm3') or rec.get('density_earth') or
                     rec.get('n_earth') or rec.get('density_l1') or rec.get('density') or rec.get('N'))

                try:
                    v = float(v) if v is not None else None
                    d = float(d) if d is not None else None
                    if v is not None and (v <= 0 or v > 5000): v = None
                    if d is not None and (d <  0 or d > 500):  d = None
                except Exception:
                    v = d = None

                if v is not None or d is not None:
                    fresh.append({'time': dt.isoformat(), 'speed': v, 'density': d})

            log.info(f'ENLIL: {len(fresh)} fresh future points fetched')
    except Exception as e:
        log.warning(f'ENLIL JSON fetch failed: {e}')
        import traceback; log.warning(traceback.format_exc())

    # ── Merge: fresh takes precedence over cached for same timestamp ──────────
    merged = {p['time']: p for p in cached}
    for p in fresh:
        merged[p['time']] = p

    timeline = sorted(merged.values(), key=lambda x: x['time'])
    log.info(f'ENLIL merged: {len(timeline)} points covering now to +9h window')
    return timeline


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
        if d is not None and not pd.isna(d) and 0.5 <= float(d) <= 200:  # <0.5 n/cc = sensor gap/fill
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
    noaa  = fetch_noaa_alerts()
    kp    = fetch_kp_data()
    kp    = fetch_kp_data()

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

    # HSS stateful + G from Kp
    try:
        with open(OUTPUT_PATH) as f: prev_json = json.load(f)
    except Exception: prev_json = {}
    hss_active  = compute_hss_active(v_kms, noaa, prev_json)
    g_level     = kp.get('g_now', '')
    noaa['hss_active'] = hss_active
    noaa['g_level']    = g_level

    # State
    state = determine_state(bz_now, v_kms, noaa)

    # ENLIL — only fetch when warranted (avoid unnecessary 174MB downloads)
    enlil_active   = True  # always fetch — caching carries data between model runs
    enlil_timeline = fetch_enlil_timeline()

    # Bz timeline
    bz_timeline     = build_bz_timeline(l1)
    plasma_timeline = build_plasma_timeline(l1)

    # Ovation
    ovation = fetch_ovation()

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
        'g_level':            g_level,
        'g_label':            g_level,
        'hss_active':         hss_active,
        'hss_watch':          noaa.get('hss_watch', False),
        'kp_now':             kp.get('kp_now'),
        'kp_observed':        kp.get('kp_observed', []),
        'kp_forecast':        kp.get('kp_forecast', []),
        'enlil_active':       bool(enlil_active),
        'enlil_timeline':     enlil_timeline,
        'timeline':           bz_timeline,
        'plasma_timeline':    plasma_timeline,
        'ovation_oval':       ovation.get('oval_boundary', []),
        'ovation_viewline':   ovation.get('view_line', []),
        'ovation_obs_time':   ovation.get('observation_time'),
        'ovation_fcst_time':  ovation.get('forecast_time'),
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    log.info(f'space_weather.json written: state={state} intensity={intensity_label} '
             f'bz={bz_now:.1f} quality={quality_label}')



# ── Cloud Grid ────────────────────────────────────────────────────────────────

CLOUD_GRID_SPACING = 0.1   # increased from 0.25 — captures more HRRR native cell variation
CLOUD_GRID_BOUNDS  = {'minLat': 38.5, 'maxLat': 47.5, 'minLon': -82.0, 'maxLon': -66.0}

# Approximate eastern coastline — points east of this are Atlantic Ocean
_COAST_MASK = {
    38.0: -74.5, 38.5: -74.2, 39.0: -74.0, 39.5: -73.8,
    40.0: -73.5, 40.5: -73.0, 41.0: -71.8, 41.5: -71.2,
    42.0: -69.9, 42.5: -70.0, 43.0: -70.5, 43.5: -70.2,
    44.0: -69.2, 44.5: -67.5, 45.0: -67.0, 45.5: -67.0,
    46.0: -67.5, 46.5: -68.0, 47.0: -68.5, 47.5: -69.0,
    48.0: -69.5,
}
_COAST_LATS = sorted(_COAST_MASK.keys())

def _max_lon_for(lat):
    for cl in _COAST_LATS:
        if lat <= cl:
            return _COAST_MASK[cl]
    return CLOUD_GRID_BOUNDS['maxLon']

def build_cloud_grid():
    """Build list of {lat, lon} dicts at CLOUD_GRID_SPACING, ocean points excluded."""
    pad  = CLOUD_GRID_SPACING * 2
    grid = []
    lat  = CLOUD_GRID_BOUNDS['minLat'] - pad
    while lat <= CLOUD_GRID_BOUNDS['maxLat'] + pad:
        max_lon = _max_lon_for(round(lat, 2))
        lon = CLOUD_GRID_BOUNDS['minLon'] - pad
        while lon <= CLOUD_GRID_BOUNDS['maxLon'] + pad:
            if lon <= max_lon:
                grid.append({'lat': round(lat, 2), 'lon': round(lon, 2)})
            lon = round(lon + CLOUD_GRID_SPACING, 2)
        lat = round(lat + CLOUD_GRID_SPACING, 2)
    log.info(f'Cloud grid: {len(grid)} points (ocean masked)')
    return grid


# ── HRRR Cloud Cover ──────────────────────────────────────────────────────────
#
# NOAA HRRR (High-Resolution Rapid Refresh): 3km, hourly, no rate limits, no seams.
# Uses byte-range HTTP to fetch only the TCDC (total cloud cover) variable
# from each forecast hour file — ~2-5MB per hour vs ~1GB full file.
#
HRRR_BASE = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/hrrr/prod/'


def fetch_hrrr_cloud(grid):
    """
    Fetch HRRR total cloud cover for our grid for the next 9 forecast hours.
    Returns dict matching cloud_cover.json format: {"lat,lon": [{t, cc}, ...]}
    or None on failure (caller falls back to Open-Meteo).

    Uses .idx byte-range technique: fetch 50KB index, find TCDC offset,
    byte-range GET only that variable (~2-5MB each forecast hour).
    Total: ~20-40MB for 10 hours. Runtime: ~15-30 seconds. Zero rate limits.
    """
    try:
        import eccodes
        import numpy as np
        from scipy.spatial import KDTree
        import tempfile
    except ImportError as e:
        log.warning(f'HRRR: missing dependency ({e})')
        return None

    now = datetime.now(timezone.utc)

    # HRRR files are ready ~45-60 min after the hour — subtract 60 min to be safe
    run_dt   = now - timedelta(minutes=60)
    run_hour = run_dt.hour
    run_date = run_dt.strftime('%Y%m%d')
    base_url = f'{HRRR_BASE}hrrr.{run_date}/conus/hrrr.t{run_hour:02d}z'
    log.info(f'HRRR: using run {run_date} {run_hour:02d}Z')

    # Fetch f00-f18 — covers the full +18h window so daytime runs (once/hr or
    # once at noon) keep the timeline populated through the aurora window
    # without needing another pull. Browser only shows +8h but caches the rest.
    run_valid = run_dt.replace(minute=0, second=0, microsecond=0)
    hours_needed = []
    for fh in range(0, 19):
        valid_time = run_valid + timedelta(hours=fh)
        offset_hr  = (valid_time - now).total_seconds() / 3600
        if -1.5 <= offset_hr <= 18.5:
            hours_needed.append((fh, valid_time))

    if not hours_needed:
        log.warning('HRRR: no forecast hours in window')
        return None

    log.info(f'HRRR: fetching forecast hours {[h[0] for h in hours_needed]}')

    all_messages = []   # list of (valid_time, lat_flat, lon_flat, cloud_flat)

    for fh, valid_time in hours_needed:
        try:
            grib_url = f'{base_url}.wrfsfcf{fh:02d}.grib2'
            idx_url  = f'{grib_url}.idx'

            # Fetch index file (~50KB)
            idx_resp = requests.get(idx_url, timeout=10)
            if not idx_resp.ok:
                log.warning(f'HRRR f{fh:02d}: idx HTTP {idx_resp.status_code}')
                continue

            # Fetch all cloud layers with aurora-visibility weights:
            # TCDC entire atmosphere — smooth continuous values, naturally captures
            # total optical depth including high cirrus. Exacerbated by light pollution
            # in combined mode via bortle weighting. 40% frontend threshold filters
            # truly negligible cirrus.
            LAYER_TARGETS = {
                'TCDC': {'level_keyword': 'entire', 'weight': 1.0},
            }

            lines = idx_resp.text.strip().split('\n')
            ranges = {}
            for i, line in enumerate(lines):
                parts = line.split(':')
                if len(parts) < 5: continue
                var   = parts[3].strip()
                level = parts[4].strip().lower()
                if var in LAYER_TARGETS and LAYER_TARGETS[var]['level_keyword'] in level:
                    byte_start = int(parts[1])
                    byte_end   = int(lines[i+1].split(':')[1]) - 1 if i+1 < len(lines) else None
                    ranges[var] = (byte_start, byte_end)

            if not ranges:
                log.warning(f'HRRR f{fh:02d}: no cloud variables found in index')
                continue

            log.info(f'HRRR f{fh:02d}: fetching {list(ranges.keys())}')

            import eccodes
            lat_arr = lon_arr = None
            layer_data = {}

            for var_name, (byte_start, byte_end) in ranges.items():
                hdrs      = {'Range': f'bytes={byte_start}-{byte_end if byte_end else ""}'}
                grib_resp = requests.get(grib_url, headers=hdrs, timeout=30)
                if grib_resp.status_code not in (200, 206):
                    log.warning(f'HRRR f{fh:02d} {var_name}: GRIB HTTP {grib_resp.status_code}')
                    continue
                with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as tmp:
                    tmp.write(grib_resp.content)
                    tmp_path = tmp.name
                try:
                    with open(tmp_path, 'rb') as gf:
                        h = eccodes.codes_grib_new_from_file(gf)
                        if h is not None:
                            try:
                                if lat_arr is None:
                                    lat_arr = eccodes.codes_get_array(h, 'latitudes')
                                    lon_arr = eccodes.codes_get_array(h, 'longitudes')
                                    lon_arr = np.where(lon_arr > 180, lon_arr - 360, lon_arr)
                                layer_data[var_name] = eccodes.codes_get_values(h)
                            finally:
                                eccodes.codes_release(h)
                finally:
                    os.unlink(tmp_path)

            if lat_arr is not None and layer_data:
                # Weighted average across all fetched layers
                # TCDC provides smooth continuous base, LCDC/MCDC add precise blocking
                # All layers at 100% = 100% cloud, all at 0% = 0% cloud
                total_weight = sum(LAYER_TARGETS[v]['weight'] for v in layer_data)
                weighted_sum = sum(layer_data[v] * LAYER_TARGETS[v]['weight'] for v in layer_data)
                cloud_arr = np.clip(weighted_sum / total_weight, 0, 100)
                all_messages.append((valid_time, lat_arr, lon_arr, cloud_arr))
                log.info(f'HRRR f{fh:02d}: valid={valid_time.strftime("%H:%MZ")}, '
                         f'{len(lat_arr)} pts, layers={list(layer_data.keys())}, '
                         f'max_cc={cloud_arr.max():.0f}%')
            else:
                log.warning(f'HRRR f{fh:02d}: no cloud data parsed')

        except Exception as e:
            log.warning(f'HRRR f{fh:02d} error: {e}')
            continue

    if not all_messages:
        log.warning('HRRR: no messages parsed — falling back to Open-Meteo')
        return None

    log.info(f'HRRR: {len(all_messages)}/{len(hours_needed)} forecast hours parsed')

    # Resample from HRRR native Lambert grid to our lat/lon query points
    # using scipy griddata bilinear interpolation — much smoother than KDTree
    # nearest-neighbour which caused visible cell boundaries at projection seams
    from scipy.interpolate import griddata

    _, lat0, lon0, _ = all_messages[0]
    mask = (
        (lat0 >= CLOUD_GRID_BOUNDS['minLat'] - 1) &
        (lat0 <= CLOUD_GRID_BOUNDS['maxLat'] + 1) &
        (lon0 >= CLOUD_GRID_BOUNDS['minLon'] - 1) &
        (lon0 <= CLOUD_GRID_BOUNDS['maxLon'] + 1)
    )
    lat_sub = lat0[mask]
    lon_sub = lon0[mask]
    native_pts = np.column_stack([lat_sub, lon_sub])

    if len(lat_sub) == 0:
        log.warning('HRRR: no grid points in bounding box')
        return None

    grid_lats = np.array([p['lat'] for p in grid])
    grid_lons = np.array([p['lon'] for p in grid])
    query_pts = np.column_stack([grid_lats, grid_lons])

    from scipy.ndimage import gaussian_filter

    # Unique lats/lons for reshaping to 2D grid
    unique_lats = sorted(set(p['lat'] for p in grid), reverse=True)
    unique_lons = sorted(set(p['lon'] for p in grid))
    lat_idx = {lat: i for i, lat in enumerate(unique_lats)}
    lon_idx = {lon: i for i, lon in enumerate(unique_lons)}
    nrows, ncols = len(unique_lats), len(unique_lons)

    results = {}
    for vt, lat_f, lon_f, tcc_f in sorted(all_messages, key=lambda x: x[0]):
        tcc_sub = tcc_f[mask]

        # Bilinear interpolation from native HRRR grid to our lat/lon points
        interp = griddata(native_pts, tcc_sub, query_pts, method='linear')

        # Fill any remaining NaN with nearest
        nan_mask = np.isnan(interp)
        if nan_mask.any():
            interp_nn = griddata(native_pts, tcc_sub, query_pts[nan_mask], method='nearest')
            interp[nan_mask] = interp_nn

        # Reshape to 2D, apply gaussian smooth to remove HRRR macro-scale artifacts,
        # then flatten back — sigma=1.5 at 0.1° spacing covers ~0.15° = ~17km
        grid2d = np.full((nrows, ncols), np.nan)
        for gi, pt in enumerate(grid):
            grid2d[lat_idx[pt['lat']], lon_idx[pt['lon']]] = interp[gi]

        # Fill NaN with local mean before smoothing so edges don't bleed
        nan2d = np.isnan(grid2d)
        grid2d[nan2d] = np.nanmean(grid2d)
        smoothed = gaussian_filter(grid2d, sigma=2.0)
        smoothed[nan2d] = np.nan  # restore ocean/edge nulls

        t_str = vt.isoformat()
        for gi, pt in enumerate(grid):
            key = f"{pt['lat']},{pt['lon']}"
            cc = smoothed[lat_idx[pt['lat']], lon_idx[pt['lon']]]
            if np.isnan(cc) or np.isinf(cc):
                continue
            entry = {'t': t_str, 'cc': int(np.clip(round(float(cc)), 0, 100))}
            if key not in results:
                results[key] = []
            results[key].append(entry)

    pct = len(results) / max(len(grid), 1) * 100
    log.info(f'HRRR: populated {len(results)}/{len(grid)} points ({pct:.0f}%) via bilinear interpolation')

    return results if len(results) >= len(grid) * 0.8 else None


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

    enlil_active   = True  # always fetch — caching carries data between model runs
    enlil_timeline = fetch_enlil_timeline()
    bz_timeline     = build_bz_timeline(l1)
    plasma_timeline = build_plasma_timeline(l1)

    # Ovation Prime aurora model
    ovation = fetch_ovation()

    # HSS stateful + G from Kp
    try:
        with open(OUTPUT_PATH) as f: prev_json = json.load(f)
    except Exception: prev_json = {}
    hss_active  = compute_hss_active(v_kms, noaa, prev_json)
    g_level     = kp.get('g_now', '')
    noaa['hss_active'] = hss_active
    noaa['g_level']    = g_level
    state = determine_state(bz_now, v_kms, noaa)

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
        'g_level':              g_level,
        'g_label':              g_level,
        'hss_active':           hss_active,
        'hss_watch':            noaa.get('hss_watch', False),
        'kp_now':               kp.get('kp_now'),
        'kp_observed':          kp.get('kp_observed', []),
        'kp_forecast':          kp.get('kp_forecast', []),
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

    # Cloud cover — HRRR primary (3km, no rate limits, no seams)
    # Falls back to Open-Meteo if HRRR fails or covers < 80% of grid
    log.info('Fetching cloud cover grid (HRRR)...')
    grid = build_cloud_grid()

    cloud_results = fetch_hrrr_cloud(grid)
    if not cloud_results:
        log.warning('HRRR failed — keeping existing cloud_cover.json from last successful run')
        log.info(f'cloud_cover.json unchanged (HRRR unavailable)')
        return  # exit early — don't overwrite good data with nothing

    cloud_output = {
        'last_updated': now.isoformat(),
        'spacing':      CLOUD_GRID_SPACING,
        'points':       cloud_results,
    }
    with open(CLOUD_OUTPUT_PATH, 'w') as f:
        json.dump(cloud_output, f, separators=(',', ':'))
    log.info(f'cloud_cover.json written: {len(cloud_results)} points')


if __name__ == '__main__':
    import sys, time
    if '--clouds' in sys.argv:
        main_with_clouds()   # cloud workflow: fetches clouds + space weather
    else:
        main()               # space weather workflow: no cloud fetch
