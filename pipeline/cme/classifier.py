"""
Bothmer-Schwenn Classifier
Now uses flux_rope_l1 module for proper L1 GSM classification
"""

from .flux_rope_l1 import classify_flux_rope_l1

class BothmerSchwennClassifier:
    
    def __init__(self, log):
        self.log = log
    
    def classify(self, cme, l1_mag, l1_plasma):
        """
        Classify CME magnetic structure using flux_rope_l1
        
        Args:
            cme: CME dict with state info
            l1_mag: L1 magnetometer data
            l1_plasma: L1 plasma data
            
        Returns:
            Classification dict with flux rope type, confidence, predictions
        """
        
        # Let flux_rope_l1 detect the actual ejecta start from L1 data
        # (velocity jump, Bt elevation, etc.) rather than using the state
        # transition timestamp, which may be artificial (e.g. G-level fast-track)
        result = classify_flux_rope_l1(
            l1_mag=l1_mag,
            l1_plasma=l1_plasma,
            shock_time=None,
            structure_duration_hrs=24.0
        )
        
        if result['insufficient_data']:
            # Pre-arrival or early post-arrival: show predictive output
            if cme['state']['current'] in ['WATCH', 'INBOUND', 'IMMINENT', 'ARRIVED', 'STORM_ACTIVE']:
                return self._predictive_classification(cme, result.get('notes', []))
            return self._empty_classification()
        
        # Map to Night Watch classification format
        classification = {
            'active': True,
            'classification_window': {
                'start': result.get('ejecta_start_time'),
                'end': self._calc_window_end(result),
                'duration_hours': result['structure_progress_pct'] / 100 * 24.0
            },
            'current': {
                'bs_type': result['type'],
                'bs_type_full': self._expand_type_name(result['type']),
                'confidence': result['confidence_pct'],
                'confidence_trend': 'STABLE',
                'locked': result['structure_progress_pct'] >= 80,
                'chirality': result['chirality']
            },
            'signatures': {
                'structure_progress_pct': result['structure_progress_pct'],
                'bz_onset_timing': result['bz_onset_timing']
            },
            'bz_predictions': {
                'description': result['aurora_impact'],
                'aurora_potential': self._map_aurora_potential(result['type']),
                'kp_estimate': self._map_kp_estimate(result['type']),
                'onset_time': result['bz_onset_timing'],
                'duration_hours_low': result['bz_south_duration_hrs_low'],
                'duration_hours_high': result['bz_south_duration_hrs_high'],
                'peak_bz_estimate': result['peak_bz_estimate_nT'],
                'flux_rope_duration_hours': 24.0,
                'bz_south_onset_hours': result.get('bz_south_onset_hrs') if result.get('bz_south_onset_hrs') is not None else self._south_onset_hours(result['type']),
            },
            'phi_events': [],
            'quality_flags': {
                'nosedive_detected': False,
                'reverted': False,
                'boundary_detected': False,
                'expert_review_needed': result['confidence_pct'] < 55
            },
            'notes': result.get('notes', [])
        }
        
        return classification
    
    def _expand_type_name(self, bs_type):
        """Expand type abbreviation to full name"""
        names = {
            'NES': 'North-East-South (South mid/trailing - sustained storm)',
            'NWS': 'North-West-South (South trailing - late onset)',
            'SEN': 'South-East-North (South leading - fast onset)',
            'SWN': 'South-West-North (Weakening - north trailing)',
            'ESW': 'East-South-West (South throughout - extreme storm)',
            'WSE': 'West-South-East (South throughout - extreme storm)',
            'ENW': 'East-North-West (North throughout - no aurora)',
            'WNE': 'West-North-East (North throughout - no aurora)',
            'unknown': 'Classification in progress'
        }
        return names.get(bs_type, bs_type)
    
    def _map_aurora_potential(self, bs_type):
        """Map B-S type to aurora potential"""
        mapping = {
            'NES': 'EXCELLENT',
            'NWS': 'GOOD',
            'SEN': 'GOOD',
            'SWN': 'WEAK',
            'ESW': 'EXTREME',
            'WSE': 'EXTREME',
            'ENW': 'NONE',
            'WNE': 'NONE',
            'unknown': 'UNKNOWN'
        }
        return mapping.get(bs_type, 'UNKNOWN')
    
    def _map_kp_estimate(self, bs_type):
        """Map B-S type to Kp estimate"""
        mapping = {
            'NES': '6-7',
            'NWS': '5-6',
            'SEN': '5-6',
            'SWN': '3-4',
            'ESW': '7-9',
            'WSE': '7-9',
            'ENW': 'N/A',
            'WNE': 'N/A',
            'unknown': 'N/A'
        }
        return mapping.get(bs_type, 'N/A')
    
    def _predictive_classification(self, cme, flux_notes=None):
        """Speed-based prediction when flux rope classification has insufficient data.

        Confidence is low (10-30%) to clearly signal this is a forecast,
        not an observed classification.  Users see the confidence gauge
        and know it will sharpen as data arrives.
        """
        from datetime import datetime, timezone

        speed = cme['properties'].get('speed_initial') or 500
        state = cme['state']['current']
        arrived = state in ['ARRIVED', 'STORM_ACTIVE']

        # Calculate ETA
        now_ts = datetime.now(timezone.utc).timestamp()
        eta_hours = None
        if cme.get('arrival', {}).get('median_prediction'):
            eta_hours = (cme['arrival']['median_prediction'] - now_ts) / 3600
        elif cme.get('arrival', {}).get('average_prediction'):
            eta_hours = (cme['arrival']['average_prediction'] - now_ts) / 3600

        # Speed-based impact estimate
        if speed > 800:
            aurora_potential, kp_estimate, confidence = 'EXCELLENT', '6-8', 25
            desc = f'Fast CME ({speed:.0f} km/s). Strong storm potential if southward Bz.'
        elif speed > 600:
            aurora_potential, kp_estimate, confidence = 'GOOD', '5-7', 20
            desc = f'Moderate CME ({speed:.0f} km/s). Moderate storm potential.'
        else:
            aurora_potential, kp_estimate, confidence = 'WEAK', '3-5', 15
            desc = f'Slow CME ({speed:.0f} km/s). Mild impact expected.'

        # Adjust for state
        if arrived:
            status_text = 'Classification in progress — collecting post-arrival L1 data'
            eta_text = 'arrived'
            confidence = min(confidence + 5, 30)
            notes = [
                'CME ARRIVED — flux rope classification building',
                'Need ~1.5 hours of post-shock L1 data for Bothmer-Schwenn typing',
                'Confidence will increase as magnetic structure is measured'
            ]
        else:
            eta_text = f'{eta_hours:.1f}h' if eta_hours is not None else 'unknown'
            status_text = f'Pre-arrival forecast (ETA {eta_text})'
            if eta_hours is not None and eta_hours < 6:
                confidence = min(confidence + 5, 30)
            notes = [
                'PRE-ARRIVAL FORECAST — based on CME speed and scoreboard predictions',
                'Bz orientation unknown until CME passes L1 — confidence reflects this',
                'Classification will sharpen automatically after arrival'
            ]

        if flux_notes:
            notes.extend(flux_notes)

        return {
            'active': True,
            'classification_window': None,
            'current': {
                'bs_type': 'unknown',
                'bs_type_full': status_text,
                'confidence': confidence,
                'confidence_trend': 'STABLE',
                'locked': False,
                'chirality': 'unknown'
            },
            'signatures': {
                'structure_progress_pct': 0,
                'bz_onset_timing': f'ETA {eta_text}'
            },
            'bz_predictions': {
                'description': desc,
                'aurora_potential': aurora_potential,
                'kp_estimate': kp_estimate,
                'onset_time': f'ETA {eta_text}',
                'duration_hours_low': None,
                'duration_hours_high': None,
                'peak_bz_estimate_nT': None
            },
            'phi_events': [],
            'quality_flags': {
                'nosedive_detected': False,
                'reverted': False,
                'boundary_detected': False,
                'expert_review_needed': True
            },
            'notes': notes
        }

    def _calc_window_end(self, result):
        """Compute classification window end from start + 24h structure duration"""
        start = result.get('ejecta_start_time')
        if not start:
            return None
        from datetime import datetime, timedelta, timezone
        try:
            dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
            return (dt + timedelta(hours=24)).isoformat()
        except Exception:
            return None

    def _south_onset_hours(self, bs_type):
        """Estimated hours after shock before Bz turns southward"""
        # Based on Bothmer-Schwenn type: S-leading types go south immediately,
        # N-leading types go south mid/late passage
        return {
            'SEN': 0, 'SWN': 0,          # South leading — immediate
            'ESW': 2, 'WSE': 2,           # South throughout — early
            'NES': 8, 'NWS': 12,          # North leading — mid/late
            'ENW': None, 'WNE': None,     # North throughout — no south
        }.get(bs_type)

    def _empty_classification(self):
        """Return empty classification when no data"""
        return {
            'active': False,
            'classification_window': None,
            'current': None,
            'signatures': {},
            'bz_predictions': None,
            'phi_events': [],
            'quality_flags': {},
            'notes': ['Insufficient data for classification']
        }
