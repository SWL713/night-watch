"""
CME Position Calculator
Uses DBM (Drag-Based Model) for propagation
"""

import math


def calculate_cme_positions(cmes, coronal_holes, log):
    """Calculate current positions for all CMEs"""
    
    positions = {
        'metadata': {'last_updated': None},
        'satellites': {
            'l1': {'distance_au': 0.01, 'distance_rsun': 215},
            'stereo_a': {'distance_au': 1.02, 'angle_from_earth_deg': 48}
        },
        'cmes': []
    }
    
    for cme in cmes:
        pos = calculate_single_cme_position(cme, coronal_holes, log)
        if pos:
            positions['cmes'].append(pos)
    
    return positions


def calculate_single_cme_position(cme, coronal_holes, log):
    """Calculate position for single CME using DBM"""
    
    from datetime import datetime, timezone
    
    # Get launch time
    launch_str = cme['source'].get('launch_time')
    if not launch_str:
        return None
    
    launch_time = datetime.fromisoformat(launch_str.replace('Z', '+00:00'))
    now = datetime.now(timezone.utc)
    elapsed_hours = (now - launch_time).total_seconds() / 3600
    
    # DBM parameters
    v0 = cme['properties']['speed_initial']  # km/s
    gamma = 0.3e-7  # km^-1 (drag coefficient)
    
    # Ambient wind speed (from coronal hole or default)
    w = 420  # km/s default
    ch = cme['source'].get('coronal_hole')
    if ch and ch.get('hss_speed_estimate'):
        w = ch['hss_speed_estimate']
    
    # DBM equation: v(t) = w + (v0 - w) * exp(-gamma * w * t)
    # where t is in seconds
    t_seconds = elapsed_hours * 3600
    v_current = w + (v0 - w) * math.exp(-gamma * w * t_seconds)
    
    # Calculate distance - ALIGN WITH SCOREBOARD if available
    km_per_au = 1.496e8
    target_au = 1.0  # Distance to L1
    distance_au = None
    distance_source = 'dbm'
    
    # Priority 1: If scoreboard arrival time available, reverse-calculate distance
    # This ensures visualizer shows CME at correct position for predicted arrival
    if cme.get('arrival', {}).get('median_prediction'):
        scoreboard_arrival = cme['arrival']['median_prediction']
        total_travel_seconds = scoreboard_arrival - launch_time.timestamp()
        elapsed_seconds = (now - launch_time).total_seconds()
        
        if total_travel_seconds > 0:
            # Linear interpolation based on time
            progress_fraction = elapsed_seconds / total_travel_seconds
            distance_au = target_au * progress_fraction
            distance_source = 'scoreboard_aligned'
    
    elif cme.get('arrival', {}).get('average_prediction'):
        scoreboard_arrival = cme['arrival']['average_prediction']
        total_travel_seconds = scoreboard_arrival - launch_time.timestamp()
        elapsed_seconds = (now - launch_time).total_seconds()
        
        if total_travel_seconds > 0:
            progress_fraction = elapsed_seconds / total_travel_seconds
            distance_au = target_au * progress_fraction
            distance_source = 'scoreboard_aligned'
    
    # Priority 2: Fallback to DBM physics calculation
    if distance_au is None:
        # Integrate to get distance: x(t) = w*t + (v0-w)/(gamma*w) * (1 - exp(-gamma*w*t))
        if abs(gamma * w) > 1e-10:
            x_km = w * t_seconds + (v0 - w) / (gamma * w) * (1 - math.exp(-gamma * w * t_seconds))
        else:
            x_km = v0 * t_seconds
        distance_au = x_km / km_per_au
    
    # Calculate progress
    progress_percent = min(100, (distance_au / target_au) * 100)
    
    # ETA - PRIORITIZE SCOREBOARD PREDICTION (NASA consensus is ground truth)
    eta_hours = None
    eta_timestamp = None
    eta_source = 'calculated'
    
    # Priority 1: Use scoreboard median prediction (TRUTH until shock detected)
    if cme.get('arrival', {}).get('median_prediction'):
        scoreboard_arrival = cme['arrival']['median_prediction']
        eta_hours = (scoreboard_arrival - now.timestamp()) / 3600
        eta_timestamp = scoreboard_arrival
        eta_source = 'scoreboard_median'
    
    # Priority 2: Use scoreboard average if median not available
    elif cme.get('arrival', {}).get('average_prediction'):
        scoreboard_arrival = cme['arrival']['average_prediction']
        eta_hours = (scoreboard_arrival - now.timestamp()) / 3600
        eta_timestamp = scoreboard_arrival
        eta_source = 'scoreboard_average'
    
    # Priority 3: DBM calculation (only if scoreboard data missing)
    elif v_current > 0:
        remaining_km = (target_au - distance_au) * km_per_au
        eta_hours = remaining_km / v_current / 3600
        eta_timestamp = now.timestamp() + (eta_hours * 3600)
        eta_source = 'dbm_model'
    
    return {
        'id': cme['id'],
        'position': {
            'distance_au': round(distance_au, 3),
            'distance_rsun': round(distance_au * 215, 1),
            'velocity_current': round(v_current, 1),
            'acceleration': 0,  # Placeholder
            'distance_source': distance_source  # NEW: track calculation method
        },
        'uncertainty': {
            'cone_half_angle_deg': cme['properties'].get('half_angle', 35),
            'distance_uncertainty_au': 0.05,
            'velocity_uncertainty': 75
        },
        'propagation': {
            'model': 'DBM',
            'gamma': gamma,
            'w_ambient': w,
            'w_from_ch': ch is not None
        },
        'progress': {
            'percent_to_l1': round(progress_percent, 1),
            'eta_hours': round(eta_hours, 1) if eta_hours else None,
            'eta_timestamp': eta_timestamp,
            'eta_source': eta_source  # NEW: track data source
        },
        'state': cme['state']['current']
    }
