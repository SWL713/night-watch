"""
CCMC Scoreboard Scraper
Fetches CME list from https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
import re


def fetch_cme_scoreboard(log):
    """
    Scrape CCMC CME Scoreboard
    
    Returns list of CME dicts with: event_id, launch_time, speed, type, predictions, etc.
    """
    
    url = 'https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/'
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the main CME table
        table = soup.find('table', {'id': 'cmeTable'}) or soup.find('table')
        
        if not table:
            log.warning("No CME table found on scoreboard")
            return []
        
        cmes = []
        rows = table.find_all('tr')[1:]  # Skip header
        
        for row in rows:
            cols = row.find_all('td')
            if len(cols) < 4:
                continue
            
            try:
                # Parse CME data from table columns
                # Adjust indices based on actual scoreboard structure
                event_id = cols[0].text.strip()
                launch_time_str = cols[1].text.strip()
                speed = float(re.sub(r'[^\d.]', '', cols[2].text))
                cme_type = cols[3].text.strip()
                
                # Parse launch time
                launch_time = parse_scoreboard_time(launch_time_str)
                
                # Extract predictions (multiple forecasters)
                predictions = extract_predictions(row, log)
                
                # Calculate statistics
                if predictions:
                    arrival_times = [p['arrival_time'] for p in predictions if p.get('arrival_time')]
                    
                    if arrival_times:
                        avg_arrival = sum(arrival_times) / len(arrival_times)
                        sorted_times = sorted(arrival_times)
                        median_arrival = sorted_times[len(sorted_times) // 2]
                        earliest = min(arrival_times)
                        latest = max(arrival_times)
                        spread_hours = (latest - earliest) / 3600  # Convert to hours
                    else:
                        avg_arrival = median_arrival = earliest = latest = None
                        spread_hours = 0
                else:
                    avg_arrival = median_arrival = earliest = latest = None
                    spread_hours = 0
                
                cme = {
                    'event_id': event_id,
                    'launch_time': launch_time.isoformat() if launch_time else None,
                    'speed': speed,
                    'type': cme_type,
                    'predictions': predictions,
                    'arrival_stats': {
                        'average': avg_arrival,
                        'median': median_arrival,
                        'earliest': earliest,
                        'latest': latest,
                        'num_predictions': len(predictions),
                        'spread_hours': spread_hours
                    },
                    'actual_arrival': None,  # Filled in later when observed
                    'status': 'ACTIVE'
                }
                
                cmes.append(cme)
                
            except Exception as e:
                log.warning(f"Failed to parse CME row: {e}")
                continue
        
        log.info(f"Scraped {len(cmes)} CMEs from scoreboard")
        return cmes
        
    except Exception as e:
        log.error(f"Scoreboard scrape failed: {e}")
        return []


def parse_scoreboard_time(time_str):
    """Parse various time formats from scoreboard"""
    
    formats = [
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d %H:%M:%S',
        '%Y/%m/%d %H:%M',
        '%m/%d/%Y %H:%M'
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt).replace(tzinfo=timezone.utc)
        except:
            continue
    
    return None


def extract_predictions(row, log):
    """Extract forecaster predictions from table row"""
    
    predictions = []
    
    # Scoreboard structure varies - this is a simplified version
    # In production, parse actual prediction columns
    
    return predictions


def sync_queue_with_scoreboard(queue, scoreboard, coronal_holes, log):
    """
    Sync CME queue with scoreboard
    
    - Add new CMEs from scoreboard
    - Update existing CMEs
    - Associate coronal holes
    """
    
    from datetime import datetime, timezone
    
    existing_ids = {cme['id'] for cme in queue['cmes']}
    scoreboard_ids = {cme['event_id'] for cme in scoreboard}
    
    # Add new CMEs
    for sb_cme in scoreboard:
        cme_id = f"CME_{sb_cme['event_id']}"
        
        if cme_id not in existing_ids:
            # New CME - create full entry
            new_cme = create_cme_from_scoreboard(sb_cme, coronal_holes, log)
            queue['cmes'].append(new_cme)
            log.info(f"Added new CME: {cme_id}")
        else:
            # Update existing CME
            for cme in queue['cmes']:
                if cme['id'] == cme_id:
                    # Update arrival predictions
                    cme['arrival'] = {
                        'average_prediction': sb_cme['arrival_stats']['average'],
                        'median_prediction': sb_cme['arrival_stats']['median'],
                        'earliest_prediction': sb_cme['arrival_stats']['earliest'],
                        'latest_prediction': sb_cme['arrival_stats']['latest'],
                        'num_models': sb_cme['arrival_stats']['num_predictions'],
                        'confidence_spread_hours': sb_cme['arrival_stats']['spread_hours']
                    }
                    break
    
    # Remove CMEs no longer on scoreboard (and in SUBSIDING state)
    queue['cmes'] = [
        cme for cme in queue['cmes']
        if cme['id'].replace('CME_', '') in scoreboard_ids or cme['state']['current'] not in ['QUIET', 'SUBSIDING']
    ]
    
    return queue


def create_cme_from_scoreboard(sb_cme, coronal_holes, log):
    """Create complete CME entry from scoreboard data"""
    
    from datetime import datetime, timezone
    
    cme_id = f"CME_{sb_cme['event_id']}"
    
    # Associate coronal hole
    ch_association = None
    # Simplified - in production, match by location/time
    
    cme = {
        'id': cme_id,
        'source': {
            'launch_time': sb_cme['launch_time'],
            'location': {'latitude': 0, 'longitude': 0},  # Parse from scoreboard
            'associated_flare': None,
            'coronal_hole': ch_association
        },
        'properties': {
            'speed_initial': sb_cme['speed'],
            'speed_current': sb_cme['speed'],
            'half_angle': 35,  # Default
            'type': sb_cme['type'],
            'direction_lat': 0,
            'direction_lon': 0
        },
        'arrival': {
            'average_prediction': sb_cme['arrival_stats']['average'],
            'median_prediction': sb_cme['arrival_stats']['median'],
            'earliest_prediction': sb_cme['arrival_stats']['earliest'],
            'latest_prediction': sb_cme['arrival_stats']['latest'],
            'num_models': sb_cme['arrival_stats']['num_predictions'],
            'confidence_spread_hours': sb_cme['arrival_stats']['spread_hours'],
            'scoreboard_url': f"https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/"
        },
        'state': {
            'current': 'QUIET',
            'entered_at': datetime.now(timezone.utc).isoformat(),
            'history': []
        },
        'classification': {
            'status': 'PENDING',
            'window_start': None,
            'window_end': None,
            'bs_type': None,
            'confidence': None
        },
        'position': {
            'distance_au': 0.01,  # At Sun initially
            'progress_percent': 0,
            'eta_hours': None
        },
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_updated': datetime.now(timezone.utc).isoformat()
    }
    
    return cme
