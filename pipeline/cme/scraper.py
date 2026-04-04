"""
CCMC Scoreboard Scraper - FIXED
Better speed and type extraction
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
import re
from html.parser import HTMLParser


class CCMCTextExtractor(HTMLParser):
    """Extract plain text lines from HTML"""
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"br", "p", "div", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"p", "div", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self.parts.append("\n")

    def handle_data(self, data):
        text = data.strip()
        if text:
            self.parts.append(text)

    def get_lines(self):
        raw_text = "\n".join(self.parts)
        raw_lines = raw_text.splitlines()
        lines = []
        for line in raw_lines:
            cleaned = re.sub(r"\s+", " ", line).strip()
            if cleaned:
                lines.append(cleaned)
        return lines


def fetch_cme_scoreboard(log):
    """Scrape CCMC CME Scoreboard"""
    
    url = 'https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/'
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        parser = CCMCTextExtractor()
        parser.feed(response.text)
        lines = parser.get_lines()
        
        active_lines, past_lines = split_sections(lines)
        active_events = parse_cme_blocks(active_lines, log)
        
        log.info(f"Scraped {len(active_events)} CMEs from scoreboard")
        return active_events
        
    except Exception as e:
        log.error(f"Scoreboard scrape failed: {e}")
        return []


def split_sections(lines):
    """Split lines into Active and Past CME sections"""
    active_idx = None
    past_idx = None
    
    for i, line in enumerate(lines):
        if line == "Active CMEs:":
            active_idx = i
        elif line == "Past CMEs:":
            past_idx = i
            break
    
    if active_idx is None:
        return lines, []
    
    if past_idx is None:
        return lines[active_idx + 1:], []
    
    active_lines = lines[active_idx + 1:past_idx]
    past_lines = lines[past_idx + 1:]
    return active_lines, past_lines


def parse_cme_blocks(section_lines, log):
    """Parse CME blocks from text lines"""
    
    events = []
    current = None
    pending_timestamp = None
    in_note = False
    
    for line in section_lines:
        if line.startswith("Previous Predictions in ") or line.startswith("CCMC Rules of the Road"):
            break
        
        if line.startswith("CME: "):
            if current:
                finalized = finalize_event(current)
                if finalized:
                    events.append(finalized)
            
            raw_id = line.replace("CME: ", "").strip()
            event_id = re.sub(r'-CME-\d+$', '', raw_id)
            
            current = {
                "raw_event_id": event_id,
                "note_full": "",
                "avg_raw": None,
                "median_raw": None,
                "models": 0,
                "not_detected": False,
            }
            pending_timestamp = None
            in_note = False
            continue
        
        if not current:
            continue
        
        if line == "This CME was not detected at Earth!":
            current["not_detected"] = True
            in_note = False
            continue
        
        if line.startswith("Actual Shock Arrival Time:"):
            in_note = False
            continue
        
        if line.startswith("Observed Geomagnetic Storm Parameters:"):
            in_note = False
            continue
        
        if line.startswith("CME Note:"):
            current["note_full"] = line.replace("CME Note:", "").strip()
            in_note = True
            continue
        
        if line.startswith("Predicted Shock Arrival Time"):
            in_note = False
            continue
        
        if in_note:
            if line.startswith("CME: ") or line.startswith("Predicted Shock Arrival Time"):
                in_note = False
            else:
                current["note_full"] += " " + line
                continue
        
        timestamp = extract_first_timestamp(line)
        if timestamp:
            pending_timestamp = timestamp
            continue
        
        if pending_timestamp:
            if "Average of all Methods" in line:
                current["avg_raw"] = pending_timestamp
                pending_timestamp = None
                continue
            
            if "Median of all Methods" in line:
                current["median_raw"] = pending_timestamp
                pending_timestamp = None
                continue
            
            method_markers = [
                "WSA-ENLIL", "Ensemble", "Other (", "CMEFM",
                "Met Office", "BoM", "NOAA/SWPC", "SIDC", "ELEvo",
                "SARM", "Cone + HAF", "IZMIRAN", "EAM"
            ]
            
            if any(marker in line for marker in method_markers):
                if "Auto Generated" not in line:
                    current["models"] += 1
                pending_timestamp = None
                continue
    
    if current:
        finalized = finalize_event(current)
        if finalized:
            events.append(finalized)
    
    return events


def extract_first_timestamp(text):
    """Extract first ISO timestamp from text"""
    match = re.search(r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z?\b", text)
    return match.group(0) if match else None


def finalize_event(evt):
    """Convert raw parsed event to final CME dict"""
    
    if not evt or not evt["raw_event_id"]:
        return None
    
    if evt.get("not_detected"):
        return None
    
    launch_time = parse_scoreboard_time(evt["raw_event_id"])
    if not launch_time:
        return None
    
    age_days = (datetime.now(timezone.utc) - launch_time).days
    if age_days > 30:
        return None
    
    avg_arrival = None
    median_arrival = None
    
    if evt["avg_raw"]:
        avg_time = parse_scoreboard_time(evt["avg_raw"])
        if avg_time:
            avg_arrival = avg_time.timestamp()
    
    if evt["median_raw"]:
        median_time = parse_scoreboard_time(evt["median_raw"])
        if median_time:
            median_arrival = median_time.timestamp()
    
    # Calculate earliest/latest with proper fallbacks
    if avg_arrival and median_arrival:
        # Both available - use spread
        spread_hours = abs(avg_arrival - median_arrival) / 3600
        spread_seconds = max(spread_hours * 3600, 3 * 3600)  # Minimum ±3 hours
        earliest = median_arrival - spread_seconds
        latest = median_arrival + spread_seconds
    elif median_arrival:
        # Only median available - use default ±6 hour spread
        spread_seconds = 6 * 3600
        earliest = median_arrival - spread_seconds
        latest = median_arrival + spread_seconds
        spread_hours = 6.0
    elif avg_arrival:
        # Only average available - use default ±6 hour spread
        spread_seconds = 6 * 3600
        earliest = avg_arrival - spread_seconds
        latest = avg_arrival + spread_seconds
        spread_hours = 6.0
    else:
        # No data - null everything
        spread_hours = 0
        earliest = None
        latest = None
    
    # Extract speed from note - FIXED to return None if not found
    speed = None
    note = evt.get("note_full", "")
    speed_match = re.search(r'(\d+)\s*km/s', note, re.IGNORECASE)
    if speed_match:
        speed = float(speed_match.group(1))

    # Estimate speed from travel time if note didn't contain speed
    if speed is None and launch_time and (avg_arrival or median_arrival):
        arrival_ts = median_arrival or avg_arrival
        travel_seconds = arrival_ts - launch_time.timestamp()
        if travel_seconds > 0:
            distance_km = 1.496e8  # 1 AU in km
            speed = round(distance_km / travel_seconds, 1)
    
    # Better CME type extraction
    cme_type = extract_cme_type(note)
    
    return {
        'event_id': launch_time.strftime('%Y-%m-%dT%H:%MZ'),
        'launch_time': launch_time.isoformat(),
        'speed': speed,  # Now None if not found
        'type': cme_type,
        'predictions': [],
        'arrival_stats': {
            'average': avg_arrival,
            'median': median_arrival,
            'earliest': earliest,
            'latest': latest,
            'num_predictions': evt["models"],
            'spread_hours': spread_hours
        },
        'actual_arrival': None,
        'status': 'ACTIVE',
        'not_detected': False
    }


def extract_cme_type(note):
    """Extract CME type from note with better pattern matching"""
    
    if not note:
        return "Unknown"
    
    note_lower = note.lower()
    
    # Check patterns in order of specificity
    if "full halo" in note_lower:
        return "Full Halo"
    elif "partial halo" in note_lower or "partial-halo" in note_lower:
        return "Partial Halo"
    elif "halo" in note_lower:
        return "Halo"
    elif "faint cme" in note_lower or "very faint" in note_lower:
        return "Faint CME"
    elif "narrow cme" in note_lower:
        return "Narrow CME"
    elif "wide cme" in note_lower or "large cme" in note_lower:
        return "Wide CME"
    elif "earth-directed" in note_lower or "earth directed" in note_lower:
        return "Earth-directed"
    elif "glancing blow" in note_lower:
        return "Glancing Blow"
    else:
        return "Unknown"


def parse_scoreboard_time(time_str):
    """Parse timestamp from scoreboard"""
    
    if not time_str:
        return None
    
    time_str = time_str.strip().rstrip('Z')
    
    formats = [
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt).replace(tzinfo=timezone.utc)
        except:
            continue
    
    return None


def sync_queue_with_scoreboard(queue, scoreboard, coronal_holes, log):
    """Sync CME queue with scoreboard"""
    
    from datetime import datetime, timezone
    
    existing_ids = {cme['id'] for cme in queue['cmes']}
    scoreboard_ids = {f"CME_{cme['event_id']}" for cme in scoreboard}
    
    for sb_cme in scoreboard:
        cme_id = f"CME_{sb_cme['event_id']}"
        
        if cme_id not in existing_ids:
            new_cme = create_cme_from_scoreboard(sb_cme, coronal_holes, log)
            queue['cmes'].append(new_cme)
            log.info(f"Added new CME: {cme_id}")
        else:
            for cme in queue['cmes']:
                if cme['id'] == cme_id:
                    cme['arrival'] = {
                        'average_prediction': sb_cme['arrival_stats']['average'],
                        'median_prediction': sb_cme['arrival_stats']['median'],
                        'earliest_prediction': sb_cme['arrival_stats']['earliest'],
                        'latest_prediction': sb_cme['arrival_stats']['latest'],
                        'num_models': sb_cme['arrival_stats']['num_predictions'],
                        'confidence_spread_hours': sb_cme['arrival_stats']['spread_hours'],
                        'scoreboard_url': "https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/"
                    }
                    if sb_cme['speed']:
                        cme['properties']['speed_current'] = sb_cme['speed']
                    cme['properties']['type'] = sb_cme['type']
                    cme['aurora_rating'] = _compute_aurora_rating(
                        cme['properties'].get('speed_current') or cme['properties'].get('speed_initial')
                    )
                    break
    
    queue['cmes'] = [
        cme for cme in queue['cmes']
        if cme['id'] in scoreboard_ids or cme['state']['current'] not in ['QUIET', 'SUBSIDING']
    ]
    
    return queue


def create_cme_from_scoreboard(sb_cme, coronal_holes, log):
    """Create complete CME entry from scoreboard data"""
    
    from datetime import datetime, timezone
    
    cme_id = f"CME_{sb_cme['event_id']}"
    
    cme = {
        'id': cme_id,
        'source': {
            'launch_time': sb_cme['launch_time'],
            'location': {'latitude': 0, 'longitude': 0},
            'associated_flare': None,
            'coronal_hole': None
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
            'scoreboard_url': "https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/"
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
        'aurora_rating': _compute_aurora_rating(sb_cme['speed']),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_updated': datetime.now(timezone.utc).isoformat()
    }

    return cme


def _compute_aurora_rating(speed):
    """Speed-based aurora potential: 0-5 stars with confidence.
    Confidence is low (25-35%) because Bz orientation is unknown pre-arrival."""
    if not speed:
        return {'stars': 0, 'confidence': 0, 'basis': 'no speed data'}
    if speed > 1200:
        return {'stars': 5, 'confidence': 30, 'basis': f'{speed:.0f} km/s — extreme'}
    if speed > 900:
        return {'stars': 4, 'confidence': 30, 'basis': f'{speed:.0f} km/s — very fast'}
    if speed > 700:
        return {'stars': 3, 'confidence': 28, 'basis': f'{speed:.0f} km/s — fast'}
    if speed > 500:
        return {'stars': 2, 'confidence': 25, 'basis': f'{speed:.0f} km/s — moderate'}
    if speed > 350:
        return {'stars': 1, 'confidence': 25, 'basis': f'{speed:.0f} km/s — slow'}
    return {'stars': 0, 'confidence': 30, 'basis': f'{speed:.0f} km/s — very slow'}
