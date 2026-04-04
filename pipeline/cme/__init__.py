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
    """Generate Bz forecast timeline for the map page overlay.

    Priority:
    1. CME classification-based: use BS type pattern to project Bz forward
    2. STEREO-A fallback: use Bn (ecliptic-north ≈ Bz) with time delay
    3. Empty: no forecast available

    Returns list of {time_iso, bz, source} points for the next 8 hours.
    """
    from datetime import datetime, timezone, timedelta
    import numpy as np

    now = datetime.now(timezone.utc)
    forecast = {'metadata': {'last_updated': now.isoformat()}, 'points': [], 'source': None}

    # --- Priority 1: CME classification-based forecast ---
    active_id = queue.get('active_cme_id')
    if active_id and active_id in classification_data.get('classifications', {}):
        cls = classification_data['classifications'][active_id]
        if cls.get('active') and cls.get('current', {}).get('bs_type', 'unknown') != 'unknown':
            bs_type = cls['current']['bs_type']
            bz_pred = cls.get('bz_predictions') or {}
            peak_bz = bz_pred.get('peak_bz_estimate') or -10
            window = cls.get('classification_window') or {}
            ejecta_start = window.get('start')

            if ejecta_start:
                try:
                    ejecta_dt = datetime.fromisoformat(ejecta_start.replace('Z', '+00:00'))
                    if ejecta_dt.tzinfo is None:
                        ejecta_dt = ejecta_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    ejecta_dt = now - timedelta(hours=24)

                # Generate 8-hour forecast based on BS type Bz profile
                # Normalized profiles: fraction of peak_bz at each phase (0-1)
                profiles = {
                    'SEN': [1.0, 0.8, 0.4, 0.0, -0.3, -0.5, -0.6, -0.7],  # south→north
                    'SWN': [1.0, 0.7, 0.3, -0.1, -0.4, -0.6, -0.7, -0.8],
                    'NES': [-0.8, -0.6, -0.2, 0.2, 0.5, 0.8, 1.0, 0.9],   # north→south
                    'NWS': [-0.7, -0.5, -0.1, 0.1, 0.4, 0.7, 0.9, 1.0],
                    'ESW': [0.6, 0.8, 1.0, 0.9, 0.8, 0.7, 0.5, 0.3],     # south throughout
                    'WSE': [0.5, 0.7, 1.0, 0.9, 0.7, 0.6, 0.4, 0.2],
                    'ENW': [-0.8, -0.9, -1.0, -0.9, -0.8, -0.7, -0.6, -0.5],  # north throughout
                    'WNE': [-0.7, -0.8, -1.0, -0.9, -0.7, -0.6, -0.5, -0.4],
                }
                profile = profiles.get(bs_type, [0]*8)
                structure_hrs = 24.0

                points = []
                for i in range(49):  # 10-min intervals, 8 hours
                    t = now + timedelta(minutes=i * 10)
                    elapsed = (t - ejecta_dt).total_seconds() / 3600
                    phase = min(max(elapsed / structure_hrs, 0), 1.0)

                    # Interpolate profile
                    idx = phase * (len(profile) - 1)
                    lo = int(idx)
                    hi = min(lo + 1, len(profile) - 1)
                    frac = idx - lo
                    bz_frac = profile[lo] * (1 - frac) + profile[hi] * frac

                    bz_val = peak_bz * bz_frac
                    points.append({
                        'time': t.isoformat(),
                        'bz': round(bz_val, 1),
                        'source': 'cme_classification'
                    })

                forecast['points'] = points
                forecast['source'] = f'CME {bs_type} profile'
                log.info(f"Bz forecast: {len(points)} points from CME {bs_type} classification")
                return forecast

    # --- Priority 2: STEREO-A Bn as Bz proxy with time delay ---
    stereo_list = None
    if isinstance(stereo_a, dict) and 'data' in stereo_a:
        stereo_list = stereo_a['data']
    elif isinstance(stereo_a, list):
        stereo_list = stereo_a

    if stereo_list and len(stereo_list) > 60:
        # STEREO-A is ~48° ahead of Earth
        # At 400 km/s solar wind, 48° ≈ 2.2 days delay
        # Use recent plasma speed for better estimate
        plasma_speed = 400  # default
        if isinstance(l1_mag, dict) and 'data' in l1_mag:
            # Can't easily get speed from mag, use default
            pass

        # Time delay: angular_separation / (360° / synodic_period)
        # Simplified: at 400 km/s, 48° ≈ 53 hours
        delay_hours = 48 * (27.27 * 24) / 360  # ~87h for 48°, scale by wind speed
        delay_hours = delay_hours * (400 / plasma_speed)  # adjust for actual speed

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
                # Bn is index 1 for list format, 'mag_hgrtn_n_nT' for dict
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
            # Downsample to ~10-min intervals
            step = max(1, len(points) // 48)
            points = points[::step]
            forecast['points'] = points
            forecast['source'] = f'STEREO-A Bn (delayed {delay_hours:.0f}h)'
            log.info(f"Bz forecast: {len(points)} points from STEREO-A Bn (delay {delay_hours:.0f}h)")
            return forecast

    forecast['source'] = 'none'
    return forecast
