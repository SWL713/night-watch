"""
CCMC Scoreboard Scraper - FIXED VERSION
Fetches CME list from https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
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
        
        # Find all table rows
        table = soup.find('table')
        if not table:
            log.warning("No table found on scoreboard")
            return []
        
        cmes = []
        current_cme = None
        seen_events = set()
        
        # Process rows
        rows = table.find_all('tr')
        
        for row in rows:
            cols = row.find_all('td')
            if len(cols) < 4:
                continue
            
            # Extract raw text from all columns
            col_texts = [col.get_text(strip=True) for col in cols]
            
            # Check if this is a MAIN EVENT ROW (has start time in format YYYY-MM-DD HH:MM:SS)
            # Main event rows have the CME start time in specific columns
            is_main_event = False
            event_time_str = None
            
            # Try to find a date pattern that looks like a CME start time
            for text in col_texts[:5]:  # Check first few columns
                # Match: YYYY-MM-DDTHH:MMZ or YYYY-MM-DD HH:MM:SS
                match = re.search(r'(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})', text)
                if match:
                    event_time_str = text
                    is_main_event = True
                    break
            
            if not is_main_event:
                # This is a prediction sub-row, skip it
                continue
            
            try:
                # Parse event time
                event_time = parse_scoreboard_time(event_time_str)
                if not event_time:
                    continue
                
                # Skip events older than 30 days
                age_days = (datetime.now(timezone.utc) - event_time).days
                if age_days > 30:
                    continue
                
                # Create unique event ID
                event_id = event_time.strftime('%Y-%m-%dT%H:%MZ')
                
                # Skip duplicates
                if event_id in seen_events:
                    continue
                seen_events.add(event_id)
                
                # Extract speed (look for number followed by km/s)
                speed = None
                for text in col_texts:
                    match = re.search(r'(\d+\.?\d*)\s*km/s', text, re.IGNORECASE)
                    if match:
                        speed = float(match.group(1))
                        break
                
                if not speed:
                    # Try to find any reasonable speed value (300-3000 km/s)
                    for text in col_texts:
                        try:
                            val = float(re.sub(r'[^\d.]', '', text))
                            if 300 <= val <= 3000:
                                speed = val
                                break
                        except:
                            continue
                
                # Default speed if not found
                if not speed:
                    speed = 500  # Default CME speed
                
                # Extract CME type
                cme_type = 'Unknown'
                for text in col_texts:
                    if 'halo' in text.lower():
                        cme_type = 'Full Halo'
                        break
                    elif 'partial' in text.lower():
                        cme_type = 'Partial Halo'
                        break
                
                # Extract arrival predictions (look for timestamps in future)
                arrival_times = []
                now = datetime.now(timezone.utc)
                
                for text in col_texts:
                    # Find future timestamps
                    match = re.search(r'(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})', text)
                    if match:
                        try:
                            pred_time = parse_scoreboard_time(text)
                            if pred_time and pred_time > now:
                                arrival_times.append(pred_time.timestamp())
                        except:
                            continue
                
                # Calculate arrival statistics
                if arrival_times:
                    avg_arrival = sum(arrival_times) / len(arrival_times)
                    sorted_times = sorted(arrival_times)
                    median_arrival = sorted_times[len(sorted_times) // 2]
                    earliest = min(arrival_times)
                    latest = max(arrival_times)
                    spread_hours = (latest - earliest) / 3600
                else:
                    avg_arrival = median_arrival = earliest = latest = None
                    spread_hours = 0
                
                cme = {
                    'event_id': event_id,
                    'launch_time': event_time.isoformat(),
                    'speed': speed,
                    'type': cme_type,
                    'predictions': [],  # Detailed predictions not parsed in simple version
                    'arrival_stats': {
                        'average': avg_arrival,
                        'median': median_arrival,
                        'earliest': earliest,
                        'latest': latest,
                        'num_predictions': len(arrival_times),
                        'spread_hours': spread_hours
                    },
                    'actual_arrival': None,
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
    
    if not time_str:
        return None
    
    formats = [
        '%Y-%m-%dT%H:%MZ',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
        '%Y/%m/%d %H:%M',
        '%m/%d/%Y %H:%M'
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(time_str.strip(), fmt).replace(tzinfo=timezone.utc)
        except:
            continue
    
    return None


def extract_predictions(row, log):
    """Extract forecaster predictions from table row"""
    predictions = []
    # Simplified - detailed prediction parsing not implemented
    return predictions


def sync_queue_with_scoreboard(queue, scoreboard, coronal_holes, log):
    """
    Sync CME queue with scoreboard
    
    - Add new CMEs from scoreboard
    - Update existing CMEs
    - Remove old CMEs
    """
    
    from datetime import datetime, timezone
    
    existing_ids = {cme['id'] for cme in queue['cmes']}
    scoreboard_ids = {f"CME_{cme['event_id']}" for cme in scoreboard}
    
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
                    # Update speed
                    cme['properties']['speed_current'] = sb_cme['speed']
                    break
    
    # Remove CMEs no longer on scoreboard (only if in SUBSIDING state)
    queue['cmes'] = [
        cme for cme in queue['cmes']
        if cme['id'] in scoreboard_ids or cme['state']['current'] not in ['QUIET', 'SUBSIDING']
    ]
    
    return queue


def create_cme_from_scoreboard(sb_cme, coronal_holes, log):
    """Create complete CME entry from scoreboard data"""
    
    from datetime import datetime, timezone
    
    cme_id = f"CME_{sb_cme['event_id']}"
    
    # Associate coronal hole (simplified - would need location matching)
    ch_association = None
    
    cme = {
        'id': cme_id,
        'source': {
            'launch_time': sb_cme['launch_time'],
            'location': {'latitude': 0, 'longitude': 0},
            'associated_flare': None,
            'coronal_hole': ch_association
        },
        'properties': {
            'speed_initial': sb_cme['speed'],
            'speed_current': sb_cme['speed'],
            'half_angle': 35,
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
            'distance_au': 0.01,
            'progress_percent': 0,
            'eta_hours': None
        },
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_updated': datetime.now(timezone.utc).isoformat()
    }
    
    return cme
