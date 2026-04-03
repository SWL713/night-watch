"""
CME State Machine
7 states: QUIET → WATCH → INBOUND → IMMINENT → ARRIVED → STORM_ACTIVE → SUBSIDING
"""

from datetime import datetime, timezone, timedelta


class CMEStateMachine:
    
    def __init__(self, log):
        self.log = log
    
    def update_state(self, cme, l1_mag, l1_plasma, stereo_a, epam):
        """Update CME state based on current data"""
        
        current_state = cme['state']['current']
        
        # State transition checks
        if current_state == 'QUIET':
            new_state = self._check_quiet_to_watch(cme, stereo_a, epam)
        elif current_state == 'WATCH':
            new_state = self._check_watch_to_inbound(cme, stereo_a, epam)
        elif current_state == 'INBOUND':
            new_state = self._check_inbound_to_imminent(cme, l1_mag, l1_plasma, epam)
        elif current_state == 'IMMINENT':
            new_state = self._check_imminent_to_arrived(cme, l1_mag, l1_plasma)
        elif current_state == 'ARRIVED':
            new_state = self._check_arrived_to_storm(cme, l1_mag)
        elif current_state == 'STORM_ACTIVE':
            new_state = self._check_storm_to_subsiding(cme, l1_mag)
        else:
            new_state = current_state
        
        # Update state if changed
        if new_state != current_state:
            self._transition_state(cme, new_state)
    
    def _check_quiet_to_watch(self, cme, stereo_a, epam):
        """QUIET → WATCH triggers"""
        
        # Trigger 1: On scoreboard
        if cme.get('arrival', {}).get('average_prediction'):
            return 'WATCH'
        
        # Trigger 2: STEREO-A elevated (if available)
        if stereo_a and len(stereo_a) > 0:
            recent = stereo_a[-30:]  # Last 30 minutes
            speeds = [p['speed_KPS'] for p in recent if p.get('speed_KPS')]
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
        if stereo_a:
            recent = stereo_a[-60:]
            speeds = [p['speed_KPS'] for p in recent if p.get('speed_KPS')]
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
            speeds = [p[1] for p in recent if len(p) > 1 and p[1]]
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
        """IMMINENT → ARRIVED triggers (shock + ejecta)"""
        
        # Check for shock (velocity jump)
        if l1_plasma and len(l1_plasma) > 20:
            recent = l1_plasma[-20:]
            speeds = [p[1] for p in recent if len(p) > 1 and p[1]]
            if len(speeds) >= 2:
                jump = speeds[-1] - speeds[0]
                if jump >= 50:  # km/s
                    # Check for low temperature (ejecta signature)
                    temps = [p[2] for p in recent if len(p) > 2 and p[2]]
                    if temps:
                        T_observed = temps[-1]
                        V = speeds[-1]
                        T_expected = 0.031 * (V ** 0.78)
                        
                        if T_observed < 0.5 * T_expected:
                            return 'ARRIVED'
        
        return 'IMMINENT'
    
    def _check_arrived_to_storm(self, cme, l1_mag):
        """ARRIVED → STORM_ACTIVE triggers"""
        
        if l1_mag and len(l1_mag) > 20:
            recent = l1_mag[-20:]
            bz_values = [p[3] for p in recent if len(p) > 3 and p[3]]
            
            if bz_values:
                avg_bz = sum(bz_values) / len(bz_values)
                if avg_bz < -5.0:  # South field
                    return 'STORM_ACTIVE'
        
        return 'ARRIVED'
    
    def _check_storm_to_subsiding(self, cme, l1_mag):
        """STORM_ACTIVE → SUBSIDING triggers"""
        
        if l1_mag and len(l1_mag) > 60:
            recent = l1_mag[-60:]
            bz_values = [p[3] for p in recent if len(p) > 3 and p[3]]
            
            if bz_values:
                avg_bz = sum(bz_values) / len(bz_values)
                if avg_bz > -3.0:  # Returning north
                    return 'SUBSIDING'
        
        return 'STORM_ACTIVE'
    
    def _transition_state(self, cme, new_state):
        """Record state transition"""
        
        old_state = cme['state']['current']
        now = datetime.now(timezone.utc).isoformat()
        
        # Add to history
        if 'history' not in cme['state']:
            cme['state']['history'] = []
        
        cme['state']['history'].append({
            'state': old_state,
            'entered': cme['state']['entered_at'],
            'exited': now,
            'trigger': f'{old_state}_TO_{new_state}'
        })
        
        # Update current
        cme['state']['current'] = new_state
        cme['state']['entered_at'] = now
        
        self.log.info(f"CME {cme['id']}: {old_state} → {new_state}")
    
    def _calc_epam_ratio(self, epam):
        """Calculate EPAM flux ratio (simplified)"""
        if not epam or len(epam) == 0:
            return 0
        
        recent = epam[-5:]
        # Calculate ratio between energy channels (simplified)
        return 1.0  # Placeholder - implement actual ratio calculation
    
    def _calculate_eta(self, cme):
        """Calculate estimated time to arrival"""
        
        # Simple calculation based on speed and distance
        speed = cme['properties'].get('speed_current', 500)
        distance_au = 1.0 - cme['position'].get('distance_au', 0)
        
        if speed > 0:
            distance_km = distance_au * 1.496e8
            hours = distance_km / speed
            return hours
        
        return None
    
    def determine_active_cme(self, cmes):
        """Determine which CME should be active/displayed"""
        
        priority_order = ['STORM_ACTIVE', 'ARRIVED', 'IMMINENT', 'INBOUND', 'WATCH']
        
        for priority_state in priority_order:
            candidates = [c for c in cmes if c['state']['current'] == priority_state]
            
            if candidates:
                # Return most recent or closest
                if priority_state in ['IMMINENT', 'INBOUND']:
                    # Choose closest ETA
                    candidates_with_eta = [(c, self._calculate_eta(c)) for c in candidates]
                    candidates_with_eta = [(c, eta) for c, eta in candidates_with_eta if eta]
                    if candidates_with_eta:
                        return min(candidates_with_eta, key=lambda x: x[1])[0]['id']
                else:
                    # Choose most recent
                    return sorted(candidates, key=lambda x: x['state']['entered_at'])[-1]['id']
        
        return None
