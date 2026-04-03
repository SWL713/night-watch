"""
Bothmer-Schwenn Classifier
Simplified 4-type version for MVP (upgradeable to full 8-type)
"""

class BothmerSchwennClassifier:
    
    def __init__(self, log):
        self.log = log
    
    def classify(self, cme, l1_mag, l1_plasma):
        """
        Classify CME magnetic structure
        
        MVP: 4 types (SOUTH_LEADING, SOUTH_TRAILING, SOUTH_THROUGHOUT, NORTH_THROUGHOUT)
        Future: Upgrade to full 8-type Bothmer-Schwenn
        """
        
        # Extract window data
        window_data = self._extract_window(cme, l1_mag, l1_plasma)
        
        if not window_data:
            return self._empty_classification()
        
        # Simplified classification logic
        bs_type = self._determine_type_simplified(window_data)
        confidence = self._calculate_confidence(window_data)
        bz_predictions = self._generate_bz_predictions(bs_type, window_data)
        
        classification = {
            'active': True,
            'classification_window': {
                'start': window_data['start_time'],
                'end': None,  # Ongoing
                'duration_hours': window_data['duration_hours']
            },
            'current': {
                'bs_type': bs_type,
                'bs_type_full': self._expand_type_name(bs_type),
                'confidence': confidence,
                'confidence_trend': 'STABLE',
                'locked': False
            },
            'signatures': window_data['signatures'],
            'bz_predictions': bz_predictions,
            'phi_events': [],
            'quality_flags': {
                'nosedive_detected': False,
                'reverted': False,
                'boundary_detected': False,
                'expert_review_needed': confidence < 55
            }
        }
        
        return classification
    
    def _extract_window(self, cme, l1_mag, l1_plasma):
        """Extract classification window data"""
        
        if not l1_mag or not l1_plasma:
            return None
        
        # Find shock arrival time (from state transition)
        shock_time = None
        for h in cme['state']['history']:
            if 'ARRIVED' in h.get('trigger', ''):
                shock_time = h['exited']
                break
        
        if not shock_time:
            return None
        
        # Extract data from shock onwards
        from datetime import datetime
        shock_dt = datetime.fromisoformat(shock_time.replace('Z', '+00:00'))
        
        # Get Bz values after shock
        bz_values = []
        by_values = []
        
        for entry in l1_mag:
            if len(entry) > 3:
                try:
                    entry_time = datetime.fromisoformat(entry[0].replace('Z', '+00:00'))
                    if entry_time >= shock_dt:
                        if entry[3]:  # Bz
                            bz_values.append(entry[3])
                        if entry[2]:  # By
                            by_values.append(entry[2])
                except:
                    continue
        
        if not bz_values:
            return None
        
        # Calculate signatures
        Tp = None
        Texp = None
        if l1_plasma:
            for entry in l1_plasma:
                if len(entry) > 2:
                    try:
                        entry_time = datetime.fromisoformat(entry[0].replace('Z', '+00:00'))
                        if entry_time >= shock_dt and entry[2]:  # Temperature
                            Tp = entry[2]
                            if entry[1]:  # Speed
                                Texp = 0.031 * (entry[1] ** 0.78)
                            break
                    except:
                        continue
        
        return {
            'start_time': shock_time,
            'duration_hours': len(bz_values) / 60.0,  # Assuming 1-min resolution
            'bz_values': bz_values,
            'by_values': by_values,
            'bz_min': min(bz_values),
            'bz_max': max(bz_values),
            'by_mean': sum(by_values) / len(by_values) if by_values else 0,
            'signatures': {
                'temperature_ratio': Tp / Texp if (Tp and Texp) else None,
                'field_enhancement': max(bz_values) / 8.0 if bz_values else 1.0,  # vs ambient ~8nT
                'variance_ratio': 0.3  # Placeholder
            }
        }
    
    def _determine_type_simplified(self, window_data):
        """
        Simplified 4-type classification
        
        Types:
        - SOUTH_LEADING: South field now (SEN + SWN)
        - SOUTH_TRAILING: South field later (NES + NWS) - BEST
        - SOUTH_THROUGHOUT: South entire time (ESW + WSE) - EXTREME
        - NORTH_THROUGHOUT: No south field (ENW + WNE) - NO AURORA
        """
        
        bz_values = window_data['bz_values']
        
        if not bz_values:
            return 'UNKNOWN'
        
        # Count south vs north time
        south_count = sum(1 for bz in bz_values if bz < 0)
        north_count = len(bz_values) - south_count
        
        south_percent = south_count / len(bz_values) if bz_values else 0
        
        # Check Bz progression
        first_half = bz_values[:len(bz_values)//2]
        second_half = bz_values[len(bz_values)//2:]
        
        avg_first = sum(first_half) / len(first_half) if first_half else 0
        avg_second = sum(second_half) / len(second_half) if second_half else 0
        
        if south_percent > 0.7:
            return 'SOUTH_THROUGHOUT'
        elif south_percent < 0.3:
            return 'NORTH_THROUGHOUT'
        elif avg_first < 0 and avg_second > avg_first:
            return 'SOUTH_LEADING'
        elif avg_first > 0 and avg_second < 0:
            return 'SOUTH_TRAILING'
        else:
            return 'SOUTH_LEADING'
    
    def _expand_type_name(self, bs_type):
        """Expand type abbreviation to full name"""
        
        names = {
            'SOUTH_LEADING': 'South Leading Edge',
            'SOUTH_TRAILING': 'South Trailing Edge (Best for Aurora)',
            'SOUTH_THROUGHOUT': 'South Throughout (Extreme)',
            'NORTH_THROUGHOUT': 'North Throughout (No Aurora)'
        }
        return names.get(bs_type, bs_type)
    
    def _calculate_confidence(self, window_data):
        """Calculate classification confidence"""
        
        confidence = 100.0
        
        # Penalize if temperature signature weak
        if window_data['signatures'].get('temperature_ratio'):
            temp_ratio = window_data['signatures']['temperature_ratio']
            if temp_ratio > 0.5:
                confidence -= 20
            elif temp_ratio > 0.3:
                confidence -= 10
        
        # Penalize if too short
        if window_data['duration_hours'] < 2:
            confidence -= 15
        
        return max(0, min(100, confidence))
    
    def _generate_bz_predictions(self, bs_type, window_data):
        """Generate Bz behavior predictions"""
        
        descriptions = {
            'SOUTH_LEADING': 'South field NOW at leading edge. Duration: 2-4 hours. Good but brief aurora.',
            'SOUTH_TRAILING': 'South field expected in 3-4 hours at trailing edge. Duration: 4-8 hours (sustained). EXCELLENT aurora potential.',
            'SOUTH_THROUGHOUT': 'Strong south field THROUGHOUT passage. Duration: 6-12+ hours. EXTREME aurora event.',
            'NORTH_THROUGHOUT': 'Northward field throughout. NO aurora potential.'
        }
        
        aurora_potentials = {
            'SOUTH_LEADING': 'GOOD',
            'SOUTH_TRAILING': 'EXCELLENT',
            'SOUTH_THROUGHOUT': 'EXTREME',
            'NORTH_THROUGHOUT': 'NONE'
        }
        
        kp_estimates = {
            'SOUTH_LEADING': '4-5',
            'SOUTH_TRAILING': '6-7',
            'SOUTH_THROUGHOUT': '7-9',
            'NORTH_THROUGHOUT': 'N/A'
        }
        
        return {
            'description': descriptions.get(bs_type, 'Unknown type'),
            'aurora_potential': aurora_potentials.get(bs_type, 'UNKNOWN'),
            'kp_estimate': kp_estimates.get(bs_type, 'N/A'),
            'onset_time': None,  # To be calculated
            'duration_hours': 4,
            'peak_bz_estimate': window_data['bz_min']
        }
    
    def _empty_classification(self):
        """Return empty classification when no data"""
        return {
            'active': False,
            'classification_window': None,
            'current': None,
            'signatures': {},
            'bz_predictions': None,
            'phi_events': [],
            'quality_flags': {}
        }
