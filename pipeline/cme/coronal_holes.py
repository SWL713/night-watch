"""
Coronal Hole Association
Fetches CH data and associates with CMEs
"""

import requests


def fetch_coronal_holes(log):
    """Fetch coronal hole data from DONKI"""
    
    try:
        # DONKI HSS events contain coronal hole info
        url = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/HSS'
        
        from datetime import datetime, timedelta
        start_date = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
        end_date = datetime.utcnow().strftime('%Y-%m-%d')
        
        params = {'startDate': start_date, 'endDate': end_date}
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        hss_events = response.json()
        
        coronal_holes = []
        for event in hss_events:
            if 'sourceLocation' in event:
                ch = {
                    'id': f"CH_{event['eventTime'].split('T')[0]}",
                    'location': {
                        'latitude': event['sourceLocation'].get('latitude', 0),
                        'longitude': event['sourceLocation'].get('longitude', 0)
                    },
                    'hss_speed_estimate': estimate_hss_speed(event),
                    'source': 'DONKI'
                }
                coronal_holes.append(ch)
        
        log.info(f"Fetched {len(coronal_holes)} coronal holes")
        return coronal_holes
        
    except Exception as e:
        log.warning(f"Coronal hole fetch failed: {e}")
        return []


def estimate_hss_speed(hss_event):
    """Estimate HSS speed from CH characteristics"""
    
    # If speed directly provided
    if 'speed' in hss_event:
        return hss_event['speed']
    
    # Estimate from area
    area = hss_event.get('area', 0)
    
    if area > 5:
        return 650  # Large CH
    elif area > 2:
        return 550  # Moderate
    elif area > 0.5:
        return 480  # Small
    else:
        return 420  # Minimal


def associate_coronal_holes(cmes, coronal_holes, log):
    """Associate CMEs with nearby coronal holes"""
    
    for cme in cmes:
        cme_lat = cme['source']['location'].get('latitude', 0)
        cme_lon = cme['source']['location'].get('longitude', 0)
        
        # Find closest CH within 20 degrees
        min_distance = float('inf')
        closest_ch = None
        
        for ch in coronal_holes:
            ch_lat = ch['location'].get('latitude', 0)
            ch_lon = ch['location'].get('longitude', 0)
            
            distance = angular_distance(cme_lat, cme_lon, ch_lat, ch_lon)
            
            if distance < min_distance and distance <= 20:
                min_distance = distance
                closest_ch = ch
        
        if closest_ch:
            cme['source']['coronal_hole'] = {
                **closest_ch,
                'distance_degrees': round(min_distance, 1)
            }
    
    return cmes


def angular_distance(lat1, lon1, lat2, lon2):
    """Calculate angular distance on sphere (degrees)"""
    
    import math
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlon_rad = math.radians(lon2 - lon1)
    
    a = math.sin((lat2_rad - lat1_rad) / 2) ** 2
    a += math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon_rad / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return math.degrees(c)
