"""
CME State Machine
7-state tracking: QUIET → WATCH → INBOUND → IMMINENT → ARRIVED → STORM_ACTIVE → SUBSIDING
"""

from datetime import datetime, timezone


class CMEStateMachine:
    def __init__(self, log):
        self.log = log
    
    def update_state(self, cme, l1_mag, l1_plasma, stereo_a, epam):
        """Update CME state based on sensor data"""
        
        # Extract lists from data if needed (defensive)
        l1_mag_list = self._extract_list(l1_mag)
        l1_plasma_list = self._extract_list(l1_plasma)
        stereo_a_list = self._extract_list(stereo_a)
        epam_list = self._extract_list(epam)
        
        current_state = cme['state']['current']
        new_state = current_state
        
        # State transitions
        if current_state == 'QUIET':
            new_state = self._check_quiet_to_watch(cme, stereo_a_list, epam_list)
        elif current_state == 'WATCH':
            new_state = self._check_watch_to_inbound(cme, stereo_a_list, epam_list)
        elif current_state == 'INBOUND':
            new_state = self._check_inbound_to_imminent(cme, l1_mag_list, l1_plasma_list, epam_list)
        elif current_state == 'IMMINENT':
            new_state = self._check_imminent_to_arrived(cme, l1_mag_list, l1_plasma_list)
        elif current_state == 'ARRIVED':
            new_state = self._check_arrived_to_storm(cme, l1_mag_list)
        elif current_state == 'STORM_ACTIVE':
            new_state = self._check_storm_to_subsiding(cme, l1_mag_list)
        
        # Update state if changed
        if new_state != current_state:
            cme['state']['history'].append({
                'from': current_state,
                'to': new_state,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            cme['state']['current'] = new_state
            cme['state']['entered_at'] = datetime.now(timezone.utc).isoformat()
    
    def _extract_list(self, data):
        """Extract list from data - handles both list and dict formats"""
        if data is None:
            return []
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # Try common keys for data arrays
            for key in ['points', 'data', 'values', 'records']:
                if key in data and isinstance(data[key], list):
                    return data[key]
            # If no array found, return empty
            return []
        return []
    
    def _check_quiet_to_watch(self, cme, stereo_a, epam):
        """QUIET → WATCH triggers"""
        
        # Trigger 1: On scoreboard
        if cme.get('arrival', {}).get('average_prediction'):
            return 'WATCH'
        
        # Trigger 2: STEREO-A elevated (if available)
        if stereo_a and len(stereo_a) > 30:
            recent = stereo_a[-30:]  # Last 30 minutes
            speeds = [p.get('speed_KPS') for p in recent if isinstance(p, dict) and p.get('speed_KPS')]
            if speeds:
                baseline = 450  # Typical solar wind
                if sum(speeds) / len(speeds) > baseline + 50:
                    return 'WATCH'
        
        # Trigger 3: EPAM early signal
        if epam and len(epam) > 0:
            flux_ratio = self._calc_epam_ratio(epam)
            if flux_ratio > 1.5:
                return 'WATCH'
        
        return 'QUIET'
    
    def _check_watch_to_inbound(self, cme, stereo_a, epam):
        """WATCH → INBOUND triggers (need both)"""
        
        stereo_ok = False
        epam_ok = False
        
        # Check STEREO-A sustained elevation
        if stereo_a and len(stereo_a) > 60:
            recent = stereo_a[-60:]
            speeds = [p.get('speed_KPS') for p in recent if isinstance(p, dict) and p.get('speed_KPS')]
            if speeds and sum(speeds) / len(speeds) > 525:  # baseline + 75
                stereo_ok = True
        
        # Check EPAM moderate signal
        if epam:
            flux_ratio = self._calc_epam_ratio(epam)
            if flux_ratio > 2.0:
                epam_ok = True
        
        if stereo_ok and epam_ok:
            return 'INBOUND'
        
        return 'WATCH'
    
    def _check_inbound_to_imminent(self, cme, l1_mag, l1_plasma, epam):
        """INBOUND → IMMINENT triggers"""
        
        # Trigger 1: EPAM strong
        if epam:
            flux_ratio = self._calc_epam_ratio(epam)
            if flux_ratio > 5.0:
                return 'IMMINENT'
        
        # Trigger 2: L1 velocity rising
        if l1_plasma and len(l1_plasma) > 30:
            recent = l1_plasma[-30:]
            # Handle both list-of-lists and list-of-dicts
            speeds = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 1:
                    speeds.append(p[1])
                elif isinstance(p, dict) and 'speed' in p:
                    speeds.append(p['speed'])
            
            if len(speeds) >= 2:
                # Check slope
                if speeds[-1] > speeds[0] + 30:  # Rising >30 km/s
                    return 'IMMINENT'
        
        # Trigger 3: ETA close
        eta_hours = self._calculate_eta(cme)
        if eta_hours and eta_hours <= 6:
            return 'IMMINENT'
        
        return 'INBOUND'
    
    def _check_imminent_to_arrived(self, cme, l1_mag, l1_plasma):
        """IMMINENT → ARRIVED triggers"""
        
        # Trigger 1: Magnetic field jump
        if l1_mag and len(l1_mag) > 10:
            recent = l1_mag[-10:]
            bt_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 4:
                    bt_values.append(p[4])  # Bt column
                elif isinstance(p, dict) and 'bt' in p:
                    bt_values.append(p['bt'])
            
            if bt_values and max(bt_values) > 15:  # Strong field
                return 'ARRIVED'
        
        # Trigger 2: Velocity spike
        if l1_plasma and len(l1_plasma) > 10:
            recent = l1_plasma[-10:]
            speeds = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 1:
                    speeds.append(p[1])
                elif isinstance(p, dict) and 'speed' in p:
                    speeds.append(p['speed'])
            
            if speeds and max(speeds) > 550:  # Fast wind
                return 'ARRIVED'
        
        return 'IMMINENT'
    
    def _check_arrived_to_storm(self, cme, l1_mag):
        """ARRIVED → STORM_ACTIVE triggers"""
        
        if l1_mag and len(l1_mag) > 30:
            recent = l1_mag[-30:]
            bz_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 0:
                    bz_values.append(p[0])  # Bz column
                elif isinstance(p, dict) and 'bz' in p:
                    bz_values.append(p['bz'])
            
            if bz_values:
                # Sustained southward Bz
                southward_count = sum(1 for bz in bz_values if bz < -5)
                if southward_count > 15:  # >50% southward
                    return 'STORM_ACTIVE'
        
        return 'ARRIVED'
    
    def _check_storm_to_subsiding(self, cme, l1_mag):
        """STORM_ACTIVE → SUBSIDING triggers"""
        
        if l1_mag and len(l1_mag) > 30:
            recent = l1_mag[-30:]
            bz_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 0:
                    bz_values.append(p[0])
                elif isinstance(p, dict) and 'bz' in p:
                    bz_values.append(p['bz'])
            
            if bz_values:
                # Bz returning northward
                northward_count = sum(1 for bz in bz_values if bz > -3)
                if northward_count > 20:  # Mostly northward
                    return 'SUBSIDING'
        
        return 'STORM_ACTIVE'
    
    def _calc_epam_ratio(self, epam):
        """Calculate EPAM flux ratio (high/low energy)"""
        if not epam or len(epam) < 5:
            return 1.0
        
        recent = epam[-5:]
        p6_vals = []
        p1_vals = []
        
        for p in recent:
            if isinstance(p, dict):
                if 'p6' in p:
                    p6_vals.append(p['p6'])
                if 'p1' in p:
                    p1_vals.append(p['p1'])
        
        if p6_vals and p1_vals:
            avg_high = sum(p6_vals) / len(p6_vals)
            avg_low = sum(p1_vals) / len(p1_vals)
            if avg_low > 0:
                return avg_high / avg_low
        
        return 1.0
    
    def _calculate_eta(self, cme):
        """Calculate ETA hours from current position"""
        # Use position calculator's ETA if available
        if 'position' in cme and 'eta_hours' in cme['position']:
            return cme['position']['eta_hours']
        return None
    
    def determine_active_cme(self, cmes):
        """Determine which CME should be 'active' (most relevant)"""
        
        # Priority: STORM_ACTIVE > ARRIVED > IMMINENT > INBOUND > WATCH > QUIET
        priority = {
            'STORM_ACTIVE': 6,
            'ARRIVED': 5,
            'IMMINENT': 4,
            'INBOUND': 3,
            'WATCH': 2,
            'QUIET': 1,
            'SUBSIDING': 0
        }
        
        active_cme = None
        highest_priority = 0
        
        for cme in cmes:
            state = cme['state']['current']
            p = priority.get(state, 0)
            
            if p > highest_priority:
                highest_priority = p
                active_cme = cme['id']
        
        return active_cme
