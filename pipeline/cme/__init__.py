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

        if queue['active_cme_id']:
            active_cme = next((c for c in queue['cmes'] if c['id'] == queue['active_cme_id']), None)

            if active_cme and active_cme['state']['current'] in ['WATCH', 'INBOUND', 'IMMINENT', 'ARRIVED', 'STORM_ACTIVE']:
                classifier = BothmerSchwennClassifier(log)
                classification = classifier.classify(active_cme, l1_mag, l1_plasma)
                classification_data['classifications'][queue['active_cme_id']] = classification
        
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
        
        log.info(f"CME Pipeline: Complete - {len(queue['cmes'])} active CMEs")
        
        return {
            'queue': queue,
            'classification': classification_data,
            'positions': positions
        }
        
    except Exception as e:
        log.error(f"CME Pipeline failed: {e}")
        # Return empty/fallback data so pipeline doesn't crash
        return {
            'queue': {'metadata': {}, 'active_cme_id': None, 'cmes': []},
            'classification': {'metadata': {}, 'classifications': {}},
            'positions': {'metadata': {}, 'cmes': []}
        }
