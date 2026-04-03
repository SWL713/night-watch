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
        
        # Determine shock_time from state history
        shock_time = None
        for h in cme['state']['history']:
            if h.get('to') == 'ARRIVED':
                shock_time = h.get('timestamp')
                break
        
        # Run flux rope classification
        result = classify_flux_rope_l1(
            l1_mag=l1_mag,
            l1_plasma=l1_plasma,
            shock_time=shock_time,
            structure_duration_hrs=24.0
        )
        
        if result['insufficient_data']:
            return self._empty_classification()
        
        # Map to Night Watch classification format
        classification = {
            'active': True,
            'classification_window': {
                'start': result.get('ejecta_start_time'),
                'end': None,  # Ongoing
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
                'peak_bz_estimate': result['peak_bz_estimate_nT']
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
