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
    
    # Integrate to get distance: x(t) = w*t + (v0-w)/(gamma*w) * (1 - exp(-gamma*w*t))
    if abs(gamma * w) > 1e-10:
        x_km = w * t_seconds + (v0 - w) / (gamma * w) * (1 - math.exp(-gamma * w * t_seconds))
    else:
        x_km = v0 * t_seconds
    
    # Convert to AU
    km_per_au = 1.496e8
    distance_au = x_km / km_per_au
    
    # Calculate progress and ETA
    target_au = 1.0  # Distance to L1
    progress_percent = min(100, (distance_au / target_au) * 100)
    
    # ETA (hours)
    if v_current > 0:
        remaining_km = (target_au - distance_au) * km_per_au
        eta_hours = remaining_km / v_current / 3600  # Convert seconds to hours
    else:
        eta_hours = None
    
    return {
        'id': cme['id'],
        'position': {
            'distance_au': round(distance_au, 3),
            'distance_rsun': round(distance_au * 215, 1),
            'velocity_current': round(v_current, 1),
            'acceleration': 0  # Placeholder
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
            'eta_timestamp': None  # Calculate if needed
        },
        'state': cme['state']['current']
    }
