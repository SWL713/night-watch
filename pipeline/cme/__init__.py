"""
CME Dashboard Pipeline
Integrates with Night Watch space weather pipeline
"""

from .scraper import fetch_cme_scoreboard
from .state_machine import CMEStateMachine
from .classifier import BothmerSchwennClassifier
from .position_calculator import calculate_cme_positions
from .coronal_holes import associate_coronal_holes

__all__ = [
    'run_cme_pipeline',
    'fetch_cme_scoreboard',
    'CMEStateMachine',
    'BothmerSchwennClassifier',
    'calculate_cme_positions',
    'associate_coronal_holes'
]


def run_cme_pipeline(l1_mag, l1_plasma, stereo_a, epam, log):
    """
    Main CME pipeline - runs as part of generate_space_weather.py
    
    Reuses already-fetched data (no duplicate API calls!)
    
    Args:
        l1_mag: L1 magnetometer data (from sw_mag_7day.json)
        l1_plasma: L1 plasma data (from sw_plasma_7day.json)
        stereo_a: STEREO-A data (from sw_stereo_a.json)
        epam: EPAM energetic particle data (from sw_epam.json)
        log: Logger instance
        
    Returns:
        dict with keys: queue, classification, positions
    """
    
    log.info("CME Pipeline: Starting")
    
    try:
        # 1. Fetch CCMC scoreboard
        scoreboard = fetch_cme_scoreboard(log)
        
        # 2. Fetch coronal holes
        from .coronal_holes import fetch_coronal_holes
        coronal_holes = fetch_coronal_holes(log)
        
        # 3. Load existing queue or initialize
        import os
        import json
        queue_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'cme_queue.json')
        
        try:
            with open(queue_path, 'r') as f:
                existing_queue = json.load(f)
        except:
            existing_queue = {
                'metadata': {'last_updated': None, 'schema_version': '1.0'},
                'active_cme_id': None,
                'cmes': []
            }
        
        # 4. Sync queue with scoreboard
        from .scraper import sync_queue_with_scoreboard
        queue = sync_queue_with_scoreboard(existing_queue, scoreboard, coronal_holes, log)
        
        # 5. Read NOAA G-level for confirmed arrival detection
        g_level = None
        try:
            sw_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'space_weather.json')
            with open(sw_path, 'r') as f:
                sw_data = json.load(f)
            g_level = sw_data.get('g_level')
        except Exception:
            pass

        # 6. Update states for all CMEs
        state_machine = CMEStateMachine(log)
        for cme in queue['cmes']:
            state_machine.update_state(cme, l1_mag, l1_plasma, stereo_a, epam, g_level=g_level)

        # 7. Determine active CME
        queue['active_cme_id'] = state_machine.determine_active_cme(queue['cmes'])

        # 8. Run classifier on active CME
        # Runs for all tracked states — classifier handles pre-arrival predictions
        classification_data = {
            'metadata': {'last_updated': None, 'active_cme_id': queue['active_cme_id']},
            'classifications': {}
        }

        for cme in queue['cmes']:
            if cme['state']['current'] in ['WATCH', 'INBOUND', 'IMMINENT', 'ARRIVED', 'STORM_ACTIVE']:
                classifier = BothmerSchwennClassifier(log)
                classification = classifier.classify(cme, l1_mag, l1_plasma)
                classification_data['classifications'][cme['id']] = classification

                # Upgrade aurora_rating with observed data when classification is real
                if classification.get('active') and classification.get('current'):
                    cur = classification['current']
                    bz_pred = classification.get('bz_predictions') or {}
                    progress = (classification.get('signatures') or {}).get('structure_progress_pct', 0)
                    _upgrade_aurora_rating(cme, cur, bz_pred, progress)
        
        # 9. Calculate positions for all active CMEs
        positions = calculate_cme_positions(queue['cmes'], coronal_holes, log)

        # 10. Check for removals
        from .utils import check_removals
        queue = check_removals(queue, classification_data, log)
        
        # Update timestamps
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        queue['metadata']['last_updated'] = now
        classification_data['metadata']['last_updated'] = now
        positions['metadata']['last_updated'] = now
        
        # 11. Generate Bz forecast for timeline overlay
        bz_forecast = _build_bz_forecast(queue, classification_data, l1_mag, stereo_a, log)

        log.info(f"CME Pipeline: Complete - {len(queue['cmes'])} active CMEs")

        return {
            'queue': queue,
            'classification': classification_data,
            'positions': positions,
            'bz_forecast': bz_forecast
        }
        
    except Exception as e:
        log.error(f"CME Pipeline failed: {e}")
        import traceback
        log.error(traceback.format_exc())
        # Return empty/fallback data so pipeline doesn't crash
        return {
            'queue': {'metadata': {}, 'active_cme_id': None, 'cmes': []},
            'classification': {'metadata': {}, 'classifications': {}},
            'positions': {'metadata': {}, 'cmes': []}
        }


def _upgrade_aurora_rating(cme, cur, bz_pred, progress):
    """Upgrade aurora_rating using observed classification data.

    Pre-arrival rating is speed-only at 25-30% confidence.
    Once we have real L1 observations, confidence scales with
    structure progress and classifier confidence.
    """
    aurora_map = {
        'EXTREME': 5, 'EXCELLENT': 4, 'GOOD': 3, 'WEAK': 2, 'NONE': 0, 'UNKNOWN': 1
    }
    bs_type = cur.get('bs_type', 'unknown')
    cls_conf = cur.get('confidence', 0)
    aurora_potential = bz_pred.get('aurora_potential', 'UNKNOWN')
    peak_bz = bz_pred.get('peak_bz_estimate')

    # Star rating from observed aurora potential
    stars = aurora_map.get(aurora_potential, 1)

    # Boost from observed peak Bz
    if peak_bz is not None and peak_bz < -20:
        stars = min(5, stars + 1)

    # Confidence scales with how much data we've seen
    # At 100% structure passed + high classifier confidence → up to 85%
    if progress >= 80:
        conf = min(85, 40 + cls_conf * 0.5)
        basis = f'Observed: {bs_type} type, {aurora_potential} aurora'
    elif progress >= 40:
        conf = min(65, 30 + cls_conf * 0.4)
        basis = f'Partial: {bs_type} type ({progress:.0f}% passed)'
    else:
        # Early post-arrival — moderate upgrade from speed-only
        conf = min(45, 25 + cls_conf * 0.2)
        basis = f'Early: {bs_type} type ({progress:.0f}% passed)'

    if peak_bz is not None:
        basis += f', peak {peak_bz:.1f} nT'

    cme['aurora_rating'] = {
        'stars': stars,
        'confidence': round(conf),
        'basis': basis
    }


def _build_bz_forecast(queue, classification_data, l1_mag, stereo_a, log):
    """Generate Bz forecast for the map timeline overlay.

    Only produces output during:
    1. Active flux rope passage — blends real L1 Bz trend with BS-type
       template.  Near-term points lean on the measured slope; further
       out the template shape takes over.
    2. STEREO-A fallback — time-shifted Bn as a Bz proxy.

    No forecast is produced during quiet (non-flux-rope) times.
    """
    from datetime import datetime, timezone, timedelta
    import numpy as np

    now = datetime.now(timezone.utc)
    forecast = {'metadata': {'last_updated': now.isoformat()}, 'points': [], 'source': None}

    # --- Priority 1: Flux rope in progress ---
    active_id = queue.get('active_cme_id')
    if active_id and active_id in classification_data.get('classifications', {}):
        cls = classification_data['classifications'][active_id]
        cur = cls.get('current') or {}
        bs_type = cur.get('bs_type', 'unknown')
        progress = (cls.get('signatures') or {}).get('structure_progress_pct', 0)
        window = cls.get('classification_window') or {}
        ejecta_start_str = window.get('start')

        # Only forecast during an active, classified flux rope that hasn't fully passed
        if (cls.get('active') and bs_type != 'unknown'
                and ejecta_start_str and progress < 100):

            try:
                ejecta_dt = datetime.fromisoformat(ejecta_start_str.replace('Z', '+00:00'))
                if ejecta_dt.tzinfo is None:
                    ejecta_dt = ejecta_dt.replace(tzinfo=timezone.utc)
            except Exception:
                ejecta_dt = None

            if ejecta_dt:
                # Get recent L1 Bz for trend
                mag_list = l1_mag.get('data', []) if isinstance(l1_mag, dict) else (l1_mag if isinstance(l1_mag, list) else [])
                recent_bz = []
                for row in mag_list[-120:]:  # last ~2 hours
                    if isinstance(row, (list, tuple)) and len(row) > 3:
                        val = row[3]  # bz at index 3
                        if isinstance(val, (int, float)):
                            recent_bz.append(val)

                # Current Bz and slope from real data
                current_bz = recent_bz[-1] if recent_bz else 0
                slope_nT_per_hr = 0
                if len(recent_bz) >= 30:
                    # 30-min smoothed slope
                    smoothed = np.convolve(recent_bz[-60:], np.ones(15)/15, mode='valid')
                    if len(smoothed) >= 2:
                        slope_nT_per_hr = (smoothed[-1] - smoothed[0]) / (len(smoothed) / 60)

                # BS-type template for shape guidance
                # Normalized: -1 (deep south) to +1 (deep north)
                profiles = {
                    'SEN': [1.0, 0.6, 0.1, -0.4, -0.7, -0.9, -0.8, -0.5],
                    'SWN': [0.8, 0.4, -0.1, -0.5, -0.7, -0.6, -0.3, 0.1],
                    'NES': [-0.5, -0.3, 0.1, 0.4, 0.7, 0.9, 0.8, 0.5],
                    'NWS': [-0.3, -0.1, 0.2, 0.5, 0.7, 0.8, 0.9, 0.6],
                    'ESW': [0.3, 0.7, 0.9, 1.0, 0.9, 0.7, 0.4, 0.1],
                    'WSE': [0.2, 0.5, 0.8, 1.0, 0.8, 0.5, 0.2, -0.1],
                    'ENW': [-0.3, -0.6, -0.9, -1.0, -0.9, -0.7, -0.4, -0.2],
                    'WNE': [-0.2, -0.5, -0.8, -1.0, -0.8, -0.5, -0.3, -0.1],
                }
                profile = profiles.get(bs_type, [0]*8)
                peak_bz = (cls.get('bz_predictions') or {}).get('peak_bz_estimate') or -10
                structure_hrs = 24.0

                points = []
                for i in range(49):  # 10-min steps, 8 hours
                    dt_min = i * 10
                    t = now + timedelta(minutes=dt_min)
                    hours_out = dt_min / 60

                    # --- Real data extrapolation ---
                    trend_bz = current_bz + slope_nT_per_hr * hours_out

                    # --- Template value at this phase ---
                    elapsed = (t - ejecta_dt).total_seconds() / 3600
                    phase = min(max(elapsed / structure_hrs, 0), 1.0)
                    idx = phase * (len(profile) - 1)
                    lo, hi = int(idx), min(int(idx) + 1, len(profile) - 1)
                    frac = idx - lo
                    template_bz = peak_bz * (profile[lo] * (1 - frac) + profile[hi] * frac)

                    # --- Blend: real data dominates near-term, template far-out ---
                    # weight_real goes from 1.0 at t=0 to 0.0 at t=4h
                    weight_real = max(0, 1.0 - hours_out / 4.0)
                    blended = trend_bz * weight_real + template_bz * (1 - weight_real)

                    points.append({
                        'time': t.isoformat(),
                        'bz': round(blended, 1),
                        'source': 'flux_rope'
                    })

                forecast['points'] = points
                forecast['source'] = f'Flux rope {bs_type} — L1 trend + template blend'
                log.info(f"Bz forecast: {len(points)} pts, slope={slope_nT_per_hr:.2f} nT/hr, type={bs_type}")
                return forecast

    # --- Priority 2: STEREO-A Bn with time delay ---
    stereo_list = None
    if isinstance(stereo_a, dict) and 'data' in stereo_a:
        stereo_list = stereo_a['data']
    elif isinstance(stereo_a, list):
        stereo_list = stereo_a

    if stereo_list and len(stereo_list) > 60:
        # STEREO-A angular separation ~48° ahead of Earth
        # Corotation delay: degrees / (360° / 27.27-day synodic period)
        delay_hours = 48 * (27.27 * 24) / 360  # ~87h

        target_start = now - timedelta(hours=delay_hours)
        target_end = target_start + timedelta(hours=8)

        points = []
        for rec in stereo_list:
            t_str = rec[0] if isinstance(rec, (list, tuple)) else rec.get('timestamp', '')
            try:
                t = datetime.fromisoformat(str(t_str).replace('Z', '+00:00'))
                if t.tzinfo is None:
                    t = t.replace(tzinfo=timezone.utc)
            except Exception:
                continue

            if target_start <= t <= target_end:
                if isinstance(rec, (list, tuple)) and len(rec) > 6:
                    bn = rec[6]  # mag_hgrtn_n_nT
                elif isinstance(rec, dict):
                    bn = rec.get('mag_hgrtn_n_nT')
                else:
                    continue

                if bn is not None and isinstance(bn, (int, float)):
                    shifted_t = t + timedelta(hours=delay_hours)
                    points.append({
                        'time': shifted_t.isoformat(),
                        'bz': round(float(bn), 1),
                        'source': 'stereo_a_bn'
                    })

        if len(points) > 10:
            step = max(1, len(points) // 48)
            points = points[::step]
            forecast['points'] = points
            forecast['source'] = f'STEREO-A Bn (corotation delay {delay_hours:.0f}h)'
            log.info(f"Bz forecast: {len(points)} pts from STEREO-A Bn")
            return forecast

    # No forecast during quiet times — return empty
    forecast['source'] = 'none'
    return forecast
