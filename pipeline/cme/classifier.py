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
        
        state = cme['state']['current']

        # Pre-arrival CMEs: predictive only — the L1 data isn't theirs
        if state in ['WATCH', 'INBOUND', 'IMMINENT']:
            return self._predictive_classification(cme)

        # Post-arrival: run flux rope classification
        # Use ARRIVED timestamp as hint ONLY if it's old enough to be real
        # (if it's within 10 min of now, the queue was just rebuilt — let L1 detect)
        from datetime import datetime, timezone
        shock_hint = None
        for h in cme['state'].get('history', []):
            if h.get('to') == 'ARRIVED':
                try:
                    ts = datetime.fromisoformat(h['timestamp'])
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    age_min = (datetime.now(timezone.utc) - ts).total_seconds() / 60
                    if age_min > 10:
                        shock_hint = h['timestamp']
                except Exception:
                    pass
                break

        result = classify_flux_rope_l1(
            l1_mag=l1_mag,
            l1_plasma=l1_plasma,
            shock_time=shock_hint if shock_hint else None,
            structure_duration_hrs=24.0
        )

        if result['insufficient_data']:
            if state in ['ARRIVED', 'STORM_ACTIVE']:
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
                'confidence': self._decay_confidence(result['confidence_pct'], result['structure_progress_pct']),
                'confidence_trend': 'DECAYING' if result['structure_progress_pct'] > 120 else 'STABLE',
                'locked': 80 <= result['structure_progress_pct'] <= 120,
                'passed': result['structure_progress_pct'] > 120,
                'chirality': result['chirality']
            },
            'signatures': {
                'structure_progress_pct': result['structure_progress_pct'],
                'bz_onset_timing': result['bz_onset_timing']
            },
            'bz_predictions': {
                'description': result['aurora_impact'],
                'aurora_potential': self._map_aurora_potential(result['type'], result.get('peak_bz_estimate_nT')),
                'kp_estimate': self._map_kp_estimate(result['type'], result.get('peak_bz_estimate_nT')),
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
    
    def _map_aurora_potential(self, bs_type, peak_bz=None):
        """Map B-S type to aurora potential, modulated by actual peak Bz.
        Type gives the ceiling; Bz magnitude determines if it's reached."""
        type_ceiling = {
            'NES': 4, 'NWS': 3, 'SEN': 3, 'SWN': 1,
            'ESW': 5, 'WSE': 5, 'ENW': 0, 'WNE': 0, 'unknown': 0
        }
        # Bz-based level: how strong is the actual southward field?
        if peak_bz is None:
            bz_level = type_ceiling.get(bs_type, 0)
        elif peak_bz > -3:
            bz_level = 0  # barely southward
        elif peak_bz > -5:
            bz_level = 1  # weak
        elif peak_bz > -10:
            bz_level = 2  # moderate
        elif peak_bz > -20:
            bz_level = 3  # good
        elif peak_bz > -30:
            bz_level = 4  # excellent
        else:
            bz_level = 5  # extreme

        level = min(type_ceiling.get(bs_type, 0), bz_level)
        labels = {0: 'NONE', 1: 'WEAK', 2: 'MODERATE', 3: 'GOOD', 4: 'EXCELLENT', 5: 'EXTREME'}
        return labels[level]

    def _map_kp_estimate(self, bs_type, peak_bz=None):
        """Map B-S type to Kp estimate, modulated by actual peak Bz and type duration."""
        # Type duration weights: how much of the peak Bz is sustained
        # ESW/WSE sustain south throughout, SWN is brief
        type_weight = {
            'ESW': 1.0, 'WSE': 1.0, 'NES': 0.8, 'NWS': 0.7,
            'SEN': 0.7, 'SWN': 0.4, 'ENW': 0.0, 'WNE': 0.0
        }.get(bs_type, 0.5)
        if peak_bz is not None and peak_bz < 0 and type_weight > 0:
            effective_bz = abs(peak_bz) * type_weight
            kp_est = min(9, 2.0 + effective_bz / 3)
            kp_lo = max(0, int(kp_est - 0.5))
            kp_hi = min(9, int(kp_est + 0.5))
            if type_weight <= 0.1:
                return 'N/A'
            return f'{kp_lo}-{kp_hi}'
        # Fallback to type-based
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
            # Find arrived timestamp from state history
            arrived_at = ''
            for h in cme['state'].get('history', []):
                if h.get('to') == 'ARRIVED':
                    try:
                        from datetime import datetime as _dt
                        at = _dt.fromisoformat(h['timestamp'].replace('Z', '+00:00'))
                        arrived_at = f' @ {at.strftime("%b %d %H:%M")} UTC'
                    except Exception:
                        pass
                    break
            status_text = f'Arrived{arrived_at} — collecting L1 data'
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

        # For arrived CMEs, set a window from ARRIVED timestamp to now
        pred_window = None
        if arrived:
            for h in cme['state'].get('history', []):
                if h.get('to') == 'ARRIVED':
                    pred_window = {'start': h['timestamp'], 'end': None}
                    break

        return {
            'active': True,
            'classification_window': pred_window,
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

    def _decay_confidence(self, raw_confidence, progress_pct):
        """Decay confidence as structure passes beyond 100%.
        At 100% the full rope has passed — confidence stays.
        Beyond 120% the rope is clearly gone — confidence decays toward 0.
        This prevents stale high-confidence classifications lingering."""
        if progress_pct <= 100:
            return raw_confidence
        elif progress_pct <= 120:
            # Gradual decay 100-120%
            decay = (progress_pct - 100) / 20  # 0 at 100%, 1 at 120%
            return raw_confidence * (1 - decay * 0.5)  # lose up to 50%
        else:
            # Beyond 120% — rapid decay
            overshoot = (progress_pct - 120) / 80  # 0 at 120%, 1 at 200%
            return max(5, raw_confidence * 0.5 * (1 - min(overshoot, 1)))

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
