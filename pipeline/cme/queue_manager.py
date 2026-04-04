"""
queue_manager.py — CME Queue Management from DONKI Scoreboard

Builds the CME queue from DONKI data (analysis, ENLIL, IPS).
Only CMEs on the scoreboard (Earth-directed) make it into the queue.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


def _parse_iso_time(time_str):
    """
    Parse ISO timestamp to datetime object.
    Handles various DONKI formats: with/without Z, with/without microseconds.
    Returns None if parsing fails.
    """
    if not time_str:
        return None
    
    try:
        # Remove 'Z' and replace with +00:00 for fromisoformat
        normalized = str(time_str).replace('Z', '+00:00')
        dt = datetime.fromisoformat(normalized)
        
        # Ensure UTC timezone
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        
        return dt
    except Exception as e:
        logger.debug(f"Time parse failed for '{time_str}': {e}")
        return None


def _safe_float(value, default=None):
    """Convert to float, return default if fails."""
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def _safe_int(value, default=None):
    """Convert to int, return default if fails."""
    try:
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def match_enlil_to_cme(cme_id, enlil_sims):
    """
    Find ENLIL simulation(s) for a given CME ID.
    
    ENLIL simulations can have multiple CME inputs. We need to find
    simulations where this CME was an input AND Earth was predicted to be hit.
    
    Args:
        cme_id: CME activityID (e.g., "2026-04-02T20:46:00-CME-001")
        enlil_sims: List of ENLIL simulation records from DONKI
    
    Returns:
        dict with keys:
          - earth_impact: True if Earth impact predicted
          - arrival_time: Predicted arrival time at Earth (datetime or None)
          - simulation_id: ENLIL simulation ID
          - kp_estimates: Dict with kp_90, kp_135, kp_180
          - is_glancing_blow: True if glancing blow
    """
    result = {
        'earth_impact': False,
        'arrival_time': None,
        'simulation_id': None,
        'kp_estimates': {},
        'is_glancing_blow': False
    }
    
    logger.debug(f"Matching CME {cme_id} against {len(enlil_sims)} ENLIL simulations")
    
    for sim_idx, sim in enumerate(enlil_sims):
        # Check if this CME was an input to this simulation
        cme_inputs = sim.get('cmeInputs', [])
        if not isinstance(cme_inputs, list):
            logger.debug(f"  Sim {sim_idx}: cmeInputs not a list, skipping")
            continue
        
        logger.debug(f"  Sim {sim_idx}: has {len(cme_inputs)} CME inputs")
        
        # Look for our CME ID in the inputs
        cme_in_simulation = False
        for input_idx, cme_input in enumerate(cme_inputs):
            input_cmeid = cme_input.get('cmeid')
            logger.debug(f"    Input {input_idx}: cmeid='{input_cmeid}' (looking for '{cme_id}')")
            if input_cmeid == cme_id:
                cme_in_simulation = True
                logger.debug(f"    ✓ MATCH FOUND!")
                break
        
        if not cme_in_simulation:
            logger.debug(f"  Sim {sim_idx}: CME {cme_id} not in inputs, skipping")
            continue
        
        # This simulation includes our CME - check for Earth impact
        # DONKI indicates Earth impact in multiple ways:
        # 1. estimatedShockArrivalTime field exists (primary indicator)
        # 2. isEarthGB field is True (glancing blow)
        # 3. impactList contains Earth location
        
        earth_impact = False
        arrival_time = None
        is_glancing = False
        
        # Method 1: Check estimatedShockArrivalTime (most reliable)
        estimated_arrival = sim.get('estimatedShockArrivalTime')
        if estimated_arrival:
            logger.debug(f"  ✓ Earth impact: estimatedShockArrivalTime = {estimated_arrival}")
            earth_impact = True
            arrival_time = _parse_iso_time(estimated_arrival)
            is_glancing = sim.get('isEarthGB', False)
        
        # Method 2: Check isEarthGB flag
        if not earth_impact and sim.get('isEarthGB'):
            logger.debug(f"  ✓ Earth impact: isEarthGB = True")
            earth_impact = True
            is_glancing = True
            # Try to get arrival time from impactList
            impact_list = sim.get('impactList', [])
            if isinstance(impact_list, list):
                for impact in impact_list:
                    loc = impact.get('location', '')
                    if 'Earth' in loc or 'earth' in loc.lower():
                        arrival_time = _parse_iso_time(impact.get('arrivalTime'))
                        break
        
        # Method 3: Check impactList explicitly
        if not earth_impact:
            impact_list = sim.get('impactList', [])
            if isinstance(impact_list, list):
                for impact in impact_list:
                    location = impact.get('location', '')
                    if location and ('Earth' in location or 'earth' in location.lower()):
                        logger.debug(f"  ✓ Earth impact: found in impactList location = {location}")
                        earth_impact = True
                        arrival_time = _parse_iso_time(impact.get('arrivalTime'))
                        is_glancing = impact.get('isGlancingBlow', False)
                        break
        
        if earth_impact:
            result['earth_impact'] = True
            result['arrival_time'] = arrival_time
            result['simulation_id'] = sim.get('simulationID')
            result['is_glancing_blow'] = is_glancing
            result['kp_estimates'] = {
                'kp_90': _safe_float(sim.get('kp_90')),
                'kp_135': _safe_float(sim.get('kp_135')),
                'kp_180': _safe_float(sim.get('kp_180'))
            }
            
            logger.debug(f"  ✓ FINAL: Earth impact confirmed | Arrival: {arrival_time} | Glancing: {is_glancing}")
            return result  # Return first Earth impact found
    
    # No Earth impact found in any simulation
    logger.debug(f"CME {cme_id}: Checked {len(enlil_sims)} simulations - NO EARTH IMPACT")
    return result


def match_ips_to_cme(cme_id, ips_events):
    """
    Find observed IPS (shock) for a given CME ID.
    
    Args:
        cme_id: CME activityID
        ips_events: List of IPS records from DONKI
    
    Returns:
        dict with keys:
          - observed: True if shock was observed
          - time: Observed shock arrival time (datetime or None)
          - instruments: List of instrument names
    """
    result = {
        'observed': False,
        'time': None,
        'instruments': []
    }
    
    for ips in ips_events:
        # Check if this IPS is linked to our CME
        linked = ips.get('linkedEvents', [])
        if not isinstance(linked, list):
            continue
        
        # linkedEvents is a list of dicts with 'activityID' key
        for link in linked:
            if isinstance(link, dict) and link.get('activityID') == cme_id:
                # Found matching IPS
                event_time = _parse_iso_time(ips.get('eventTime'))
                instruments = ips.get('instruments', [])
                
                # Extract instrument display names
                instrument_names = []
                if isinstance(instruments, list):
                    for inst in instruments:
                        if isinstance(inst, dict):
                            instrument_names.append(inst.get('displayName', ''))
                        elif isinstance(inst, str):
                            instrument_names.append(inst)
                
                result['observed'] = True
                result['time'] = event_time
                result['instruments'] = instrument_names
                
                return result  # Return first match
    
    return result


def build_cme_queue_from_donki(cme_analysis_records, enlil_sims, ips_events):
    """
    Build CME queue from DONKI data.
    
    Only CMEs with Earth impact predictions make it onto the scoreboard.
    
    Args:
        cme_analysis_records: List of CME analysis from fetch_cme_analysis()
        enlil_sims: List of ENLIL simulations from fetch_enlil_simulations()
        ips_events: List of IPS events from fetch_ips_events()
    
    Returns:
        List of CME queue entries (dicts), sorted by ETA (closest first).
        Empty list if no Earth-directed CMEs.
    """
    logger.info("Building CME queue from DONKI scoreboard...")
    logger.info(f"Input data: {len(cme_analysis_records)} CME records, {len(enlil_sims)} ENLIL sims, {len(ips_events)} IPS events")
    
    # Enable debug logging for matching
    original_level = logger.level
    logger.setLevel(logging.DEBUG)
    
    now = datetime.now(timezone.utc)
    queue = []
    skipped_no_earth = []
    
    for cme in cme_analysis_records:
        cme_id = cme.get('associatedCMEID')
        if not cme_id:
            logger.debug("CME record missing associatedCMEID, skipping")
            continue
        
        logger.debug(f"\n{'='*60}")
        logger.debug(f"Processing CME: {cme_id}")
        logger.debug(f"{'='*60}")
        
        # Match ENLIL predictions
        enlil_match = match_enlil_to_cme(cme_id, enlil_sims)
        
        # Only add to queue if Earth impact predicted
        if not enlil_match['earth_impact']:
            logger.debug(f"CME {cme_id}: No Earth impact predicted, skipping")
            skipped_no_earth.append(cme_id)
            continue
        
        # Match observed shock (if arrived)
        ips_match = match_ips_to_cme(cme_id, ips_events)
        
        # Parse launch time
        launch_time = _parse_iso_time(cme.get('time21_5'))
        
        # Calculate position and ETA
        arrival_time = enlil_match['arrival_time']
        if arrival_time:
            time_to_arrival = (arrival_time - now).total_seconds()
            hours_to_arrival = time_to_arrival / 3600
            
            # Rough distance calculation (assumes constant speed from Sun to L1)
            # L1 is ~0.01 AU from Earth, ~1 AU from Sun
            if hours_to_arrival > 0:
                # CME still en route
                total_transit_hours = (arrival_time - launch_time).total_seconds() / 3600 if launch_time else 72
                elapsed_hours = (now - launch_time).total_seconds() / 3600 if launch_time else 0
                progress_fraction = max(0, min(1, elapsed_hours / total_transit_hours))
                distance_au = 1.0 - progress_fraction  # Distance from L1
            else:
                # CME has arrived or passed
                distance_au = 0.0
                progress_fraction = 1.0
        else:
            # No ENLIL prediction time - use rough estimate
            hours_to_arrival = None
            distance_au = 0.5  # Unknown
            progress_fraction = 0.5
        
        # Determine state
        if ips_match['observed']:
            state = 'ARRIVED'
        elif hours_to_arrival is not None and hours_to_arrival < 12:
            state = 'IMMINENT'
        elif hours_to_arrival is not None and hours_to_arrival < 48:
            state = 'INBOUND'
        else:
            state = 'WATCH'
        
        # Build queue entry
        entry = {
            'id': cme_id,
            'source': {
                'launch_time': launch_time.isoformat() if launch_time else None,
                'location': {
                    'latitude': _safe_float(cme.get('latitude'), 0),
                    'longitude': _safe_float(cme.get('longitude'), 0)
                },
                'associated_flare': None,  # Not in CMEAnalysis - would need to fetch FLR separately
                'catalog': cme.get('catalog', 'M2M_CATALOG')
            },
            'properties': {
                'speed_initial': _safe_float(cme.get('speed')),
                'speed_current': None,  # Updated when L1 data available (Phase 2)
                'half_angle': _safe_float(cme.get('halfAngle')),
                'type': cme.get('type', 'Unknown'),
                'direction_lat': _safe_float(cme.get('latitude'), 0),
                'direction_lon': _safe_float(cme.get('longitude'), 0)
            },
            'arrival': {
                'enlil_prediction': arrival_time.isoformat() if arrival_time else None,
                'average_prediction': arrival_time.timestamp() if arrival_time else None,
                'median_prediction': arrival_time.timestamp() if arrival_time else None,
                'earliest_prediction': arrival_time.timestamp() if arrival_time else None,
                'latest_prediction': arrival_time.timestamp() if arrival_time else None,
                'num_models': 1,  # WSA-ENLIL
                'confidence_spread_hours': 0.0  # Single model - no spread
            },
            'state': {
                'current': state,
                'entered_at': now.isoformat(),
                'history': [
                    {'from': 'QUIET', 'to': state, 'timestamp': now.isoformat()}
                ]
            },
            'classification': {
                'status': 'PENDING',
                'window_start': None,
                'window_end': None,
                'bs_type': None,
                'confidence': None
            },
            'position': {
                'distance_au': round(distance_au, 3),
                'progress_percent': round(progress_fraction * 100, 1),
                'eta_hours': round(hours_to_arrival, 1) if hours_to_arrival else None
            },
            'donki_metadata': {
                'activity_id': cme_id,
                'enlil_simulation_id': enlil_match['simulation_id'],
                'kp_estimates': enlil_match['kp_estimates'],
                'is_glancing_blow': enlil_match['is_glancing_blow'],
                'on_scoreboard': True,
                'ips_observed_shock': {
                    'time': ips_match['time'].isoformat() if ips_match['time'] else None,
                    'instruments': ips_match['instruments']
                } if ips_match['observed'] else None
            },
            'created_at': now.isoformat(),
            'last_updated': now.isoformat()
        }
        
        queue.append(entry)
        logger.info(f"Added to queue: {cme_id} | State: {state} | ETA: {hours_to_arrival:.1f}h" if hours_to_arrival else f"Added to queue: {cme_id} | State: {state}")
    
    # Sort by ETA (closest first, then by state priority)
    def sort_key(cme):
        eta = cme['position']['eta_hours']
        state = cme['state']['current']
        
        # Priority: ARRIVED > IMMINENT > INBOUND > WATCH
        state_priority = {'ARRIVED': 0, 'IMMINENT': 1, 'INBOUND': 2, 'WATCH': 3}
        priority = state_priority.get(state, 4)
        
        # Sort by priority first, then ETA
        # Use 9999 for None ETA so they sort last
        return (priority, eta if eta is not None else 9999)
    
    queue.sort(key=sort_key)
    
    # Restore original logging level
    logger.setLevel(original_level)
    
    # Summary
    logger.info(f"CME queue built: {len(queue)} Earth-directed CMEs")
    if skipped_no_earth:
        logger.info(f"Skipped {len(skipped_no_earth)} CMEs (no Earth impact predicted):")
        for cme_id in skipped_no_earth[:5]:  # Show first 5
            logger.info(f"  - {cme_id}")
        if len(skipped_no_earth) > 5:
            logger.info(f"  ... and {len(skipped_no_earth) - 5} more")
    
    return queue
