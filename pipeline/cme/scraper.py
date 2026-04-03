"""
CCMC Scoreboard Scraper - FINAL FIX
Based on actual scoreboard structure analysis
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
    """
    Scrape CCMC CME Scoreboard
    
    Returns list of CME dicts
    """
    
    url = 'https://kauai.ccmc.gsfc.nasa.gov/CMEscoreboard/'
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Parse HTML to text lines
        parser = CCMCTextExtractor()
        parser.feed(response.text)
        lines = parser.get_lines()
        
        # Split into Active and Past sections
        active_lines, past_lines = split_sections(lines)
        
        # Parse Active CMEs only
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
        # Fallback: treat all as active
        return lines, []
    
    if past_idx is None:
        # No past section, all active
        return lines[active_idx + 1:], []
    
    active_lines = lines[active_idx + 1:past_idx]
    past_lines = lines[past_idx + 1:]
    return active_lines, past_lines


def parse_cme_blocks(section_lines, log):
    """
    Parse CME blocks from text lines
    
    Structure (ACTUAL from scoreboard):
    CME: 2026-04-02T20:46:00-CME-001
    CME Note: ...
    Predicted Shock Arrival Time
    2026-04-05T20:00Z (-7.0h, +7.0h) ...
    2026-04-05T20:00Z ...
    Average of all Methods	Auto Generated (CCMC)	Detail
    2026-04-05T20:00Z ...
    Median of all Methods	Auto Generated (CCMC)	Detail
    """
    
    events = []
    current = None
    pending_timestamp = None
    in_note = False
    
    for line in section_lines:
        # Stop at footer
        if line.startswith("Previous Predictions in ") or line.startswith("CCMC Rules of the Road"):
            break
        
        # New CME event - Format: "CME: 2026-04-02T20:46:00-CME-001"
        if line.startswith("CME: "):
            # Finalize previous event
            if current:
                finalized = finalize_event(current)
                if finalized:
                    events.append(finalized)
            
            # Extract event ID and remove -CME-001 suffix
            raw_id = line.replace("CME: ", "").strip()
            # Remove -CME-XXX suffix if present
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
        
        # Not detected flag
        if line == "This CME was not detected at Earth!":
            current["not_detected"] = True
            in_note = False
            continue
        
        # Skip observed data sections
        if line.startswith("Actual Shock Arrival Time:"):
            in_note = False
            continue
        
        if line.startswith("Observed Geomagnetic Storm Parameters:"):
            in_note = False
            continue
        
        # CME Note section
        if line.startswith("CME Note:"):
            current["note_full"] = line.replace("CME Note:", "").strip()
            in_note = True
            continue
        
        # Prediction section header
        if line.startswith("Predicted Shock Arrival Time"):
            in_note = False
            continue
        
        # Multi-line CME notes
        if in_note:
            if line.startswith("CME: ") or line.startswith("Predicted Shock Arrival Time"):
                in_note = False
            else:
                current["note_full"] += " " + line
                continue
        
        # Check if this line has a timestamp
        timestamp = extract_first_timestamp(line)
        if timestamp:
            pending_timestamp = timestamp
            continue
        
        # Check if this is "Average of all Methods" or "Median of all Methods"
        # These come AFTER the timestamp line
        if pending_timestamp:
            if "Average of all Methods" in line:
                current["avg_raw"] = pending_timestamp
                pending_timestamp = None
                continue
            
            if "Median of all Methods" in line:
                current["median_raw"] = pending_timestamp
                pending_timestamp = None
                continue
            
            # Count actual model submissions (not auto-generated)
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
    
    # Finalize last event
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
    
    # Skip if not detected at Earth
    if evt.get("not_detected"):
        return None
    
    # Parse launch time
    launch_time = parse_scoreboard_time(evt["raw_event_id"])
    if not launch_time:
        return None
    
    # Skip old events (>30 days)
    age_days = (datetime.now(timezone.utc) - launch_time).days
    if age_days > 30:
        return None
    
    # Parse arrival times
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
    
    # Calculate spread
    if avg_arrival and median_arrival:
        spread_hours = abs(avg_arrival - median_arrival) / 3600
    else:
        spread_hours = 0
    
    # Extract speed from note (if mentioned)
    speed = 500  # Default
    note = evt.get("note_full", "")
    speed_match = re.search(r'(\d+)\s*km/s', note, re.IGNORECASE)
    if speed_match:
        speed = float(speed_match.group(1))
    
    # Classify type from note
    note_lower = note.lower()
    if "full halo" in note_lower:
        cme_type = "Full Halo"
    elif "partial halo" in note_lower:
        cme_type = "Partial Halo"
    elif "halo" in note_lower:
        cme_type = "Halo"
    elif "earth-directed" in note_lower:
        cme_type = "Earth-directed"
    else:
        cme_type = "Unknown"
    
    return {
        'event_id': launch_time.strftime('%Y-%m-%dT%H:%MZ'),
        'launch_time': launch_time.isoformat(),
        'speed': speed,
        'type': cme_type,
        'predictions': [],
        'arrival_stats': {
            'average': avg_arrival,
            'median': median_arrival,
            'earliest': median_arrival,
            'latest': avg_arrival,
            'num_predictions': evt["models"],
            'spread_hours': spread_hours
        },
        'actual_arrival': None,
        'status': 'ACTIVE',
        'not_detected': False
    }


def parse_scoreboard_time(time_str):
    """Parse timestamp from scoreboard"""
    
    if not time_str:
        return None
    
    # Strip trailing Z if present
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
    
    # Add new CMEs
    for sb_cme in scoreboard:
        cme_id = f"CME_{sb_cme['event_id']}"
        
        if cme_id not in existing_ids:
            new_cme = create_cme_from_scoreboard(sb_cme, coronal_holes, log)
            queue['cmes'].append(new_cme)
            log.info(f"Added new CME: {cme_id}")
        else:
            # Update existing CME
            for cme in queue['cmes']:
                if cme['id'] == cme_id:
                    cme['arrival'] = {
                        'average_prediction': sb_cme['arrival_stats']['average'],
                        'median_prediction': sb_cme['arrival_stats']['median'],
                        'earliest_prediction': sb_cme['arrival_stats']['earliest'],
                        'latest_prediction': sb_cme['arrival_stats']['latest'],
                        'num_models': sb_cme['arrival_stats']['num_predictions'],
                        'confidence_spread_hours': sb_cme['arrival_stats']['spread_hours']
                    }
                    cme['properties']['speed_current'] = sb_cme['speed']
                    break
    
    # Remove CMEs no longer on scoreboard
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
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_updated': datetime.now(timezone.utc).isoformat()
    }
    
    return cme
