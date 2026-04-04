"""
donki.py — DONKI API Client for CME Scoreboard Integration

Fetches CME analysis, WSA-ENLIL predictions, and observed shock arrivals
from NASA's DONKI database (Database Of Notifications, Knowledge, Information).

Public API - no authentication required.
"""

import logging
import requests
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

BASE_URL = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"
TIMEOUT = 90  # seconds (DONKI can be slow, especially WSAEnlilSimulations)


def _safe_get(url, params, description):
    """
    Safe HTTP GET with error handling and logging.
    Returns parsed JSON or None on failure.
    """
    try:
        logger.info(f"DONKI fetch: {description}")
        logger.debug(f"URL: {url}")
        logger.debug(f"Params: {params}")
        
        r = requests.get(url, params=params, timeout=TIMEOUT)
        r.raise_for_status()
        
        data = r.json()
        
        if isinstance(data, list):
            logger.info(f"{description}: {len(data)} records")
        else:
            logger.info(f"{description}: success")
        
        return data
        
    except requests.Timeout:
        logger.warning(f"{description}: timeout after {TIMEOUT}s")
        return None
    except requests.RequestException as e:
        logger.warning(f"{description}: request failed - {e}")
        return None
    except ValueError as e:
        logger.warning(f"{description}: JSON parse failed - {e}")
        return None


def fetch_cme_analysis(days_back=7):
    """
    Fetch CME analysis from DONKI (coronagraph measurements + WSA-ENLIL inputs).
    
    Returns list of CME analysis records with fields:
      - associatedCMEID: Activity ID (e.g., "2026-04-02T20:46:00-CME-001")
      - time21_5: Time CME reached 21.5 solar radii (measurement time)
      - latitude: Source latitude on Sun
      - longitude: Source longitude on Sun
      - halfAngle: Half-angle width (degrees)
      - speed: Linear speed (km/s)
      - type: CME type (S=Slow, C=Common, O=Occasional, R=Rare)
      - isMostAccurate: True if this is the best measurement for this CME
      - catalog: M2M_CATALOG, SWPC_ANNEX_CME_CATALOG, etc.
      - note: Optional analyst notes
    
    Args:
        days_back: How many days back to query (default 7)
    
    Returns:
        list of dicts, or empty list on failure
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    url = f"{BASE_URL}/CMEAnalysis"
    params = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d'),
        'mostAccurateOnly': 'true',      # Only get best measurement per CME
        'completeEntryOnly': 'true',     # Only complete records
        'speed': 0,                       # No lower speed limit
        'halfAngle': 0,                   # No lower angle limit
        'catalog': 'M2M_CATALOG'          # Primary NASA catalog
    }
    
    data = _safe_get(url, params, "CMEAnalysis")
    return data if data is not None else []


def fetch_ips_events(days_back=7):
    """
    Fetch Interplanetary Shock (IPS) events from DONKI.
    These are OBSERVED shock arrivals at spacecraft (L1, STEREO-A, etc.).
    
    This is the ground truth for when a shock actually hit.
    
    Returns list of IPS records with fields:
      - activityID: Shock event ID
      - catalog: M2M_CATALOG, WINSLOW_MESSENGER_ICME_CATALOG, etc.
      - location: Where shock was observed (Earth, STEREO A, Mars, etc.)
      - eventTime: UTC timestamp of shock arrival
      - instruments: List of instruments that detected it
      - linkedEvents: List of linked CME activityIDs
    
    Args:
        days_back: How many days back to query (default 7)
    
    Returns:
        list of dicts, or empty list on failure
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    url = f"{BASE_URL}/IPS"
    params = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d'),
        'location': 'Earth',              # Filter to Earth arrivals only
        'catalog': 'M2M_CATALOG'
    }
    
    data = _safe_get(url, params, "IPS (Interplanetary Shocks)")
    return data if data is not None else []


def fetch_enlil_simulations(days_back=7):
    """
    Fetch WSA-ENLIL+Cone model simulation outputs from DONKI.
    These contain predicted arrival times at Earth and other locations.
    
    Returns list of simulation records with fields:
      - simulationID: Unique simulation ID
      - modelCompletionTime: When model run finished
      - cmeInputs: List of CME inputs to the model (each with cmeStartTime, 
                   latitude, longitude, speed, halfAngle, time21_5, cmeid)
      - estimatedShockArrivalTime: Predicted shock arrival at Earth (if Earth impact)
      - estimatedDuration: Predicted duration
      - isEarthGB: True if glancing blow at Earth
      - impactList: List of predicted impacts (location, arrivalTime, isGlancingBlow)
      - kp_18, kp_90, kp_135, kp_180: Predicted Kp for different Bz clock angles
      - ipsList: Linked observed IPS events (for validation)
    
    Args:
        days_back: How many days back to query (default 7)
    
    Returns:
        list of dicts, or empty list on failure
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    url = f"{BASE_URL}/WSAEnlilSimulations"
    params = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d')
    }
    
    data = _safe_get(url, params, "WSA-ENLIL Simulations")
    return data if data is not None else []


def get_earth_directed_cmes():
    """
    Main entry point: Fetch all DONKI data needed for CME queue.
    
    Queries last 7 days of:
      - CME analysis (coronagraph measurements)
      - WSA-ENLIL simulations (arrival predictions)
      - IPS events (observed shocks)
    
    Returns dict with keys:
      - cmes: List of CME analysis records
      - enlil_sims: List of ENLIL simulation records
      - ips_events: List of observed shock records
    
    Returns empty dict on total failure.
    """
    logger.info("=" * 60)
    logger.info("DONKI: Fetching Earth-directed CMEs from scoreboard")
    logger.info("=" * 60)
    
    # Fetch all three datasets
    cmes = fetch_cme_analysis(days_back=7)
    enlil_sims = fetch_enlil_simulations(days_back=7)
    ips_events = fetch_ips_events(days_back=7)
    
    # Log summary
    logger.info(f"DONKI fetch complete:")
    logger.info(f"  CME Analysis:      {len(cmes)} records")
    logger.info(f"  ENLIL Simulations: {len(enlil_sims)} records")
    logger.info(f"  IPS Events:        {len(ips_events)} records")
    
    return {
        'cmes': cmes,
        'enlil_sims': enlil_sims,
        'ips_events': ips_events
    }
