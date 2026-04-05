"""
CME State Machine
7-state tracking: QUIET → WATCH → INBOUND → IMMINENT → ARRIVED → STORM_ACTIVE → SUBSIDING
"""

from datetime import datetime, timezone


class CMEStateMachine:
    def __init__(self, log):
        self.log = log
    
    def update_state(self, cme, l1_mag, l1_plasma, stereo_a, epam, g_level=None):
        """Update CME state based on sensor data. Loops until stable."""

        # Extract lists from data if needed (defensive)
        l1_mag_list = self._extract_list(l1_mag)
        l1_plasma_list = self._extract_list(l1_plasma)
        stereo_a_list = self._extract_list(stereo_a)
        epam_list = self._extract_list(epam)

        # Loop until state stabilizes (CME can advance multiple states per run)
        for _ in range(6):
            current_state = cme['state']['current']
            new_state = current_state

            # Check for confirmed arrival first (NOAA G-scale or L1 shock)
            # Can fast-track from any pre-arrival state
            if current_state in ['WATCH', 'INBOUND', 'IMMINENT']:
                confirmed = self._check_confirmed_arrival(cme, l1_mag_list, l1_plasma_list, g_level)
                if confirmed:
                    new_state = 'ARRIVED'

            # Normal state transitions (only if not fast-tracked)
            if new_state == current_state:
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

            if new_state == current_state:
                break  # stable

            # Record transition
            self.log.info(f"CME {cme.get('id')}: {current_state} -> {new_state}")
            cme['state']['history'].append({
                'from': current_state,
                'to': new_state,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            cme['state']['current'] = new_state
            cme['state']['entered_at'] = datetime.now(timezone.utc).isoformat()

            # Update speed_current when CME arrives at Earth
            if new_state == 'ARRIVED' and l1_plasma_list:
                self._update_speed_from_l1(cme, l1_plasma_list)

        # Keep showing real-time L1 speed for post-arrival states
        if cme['state']['current'] in ['ARRIVED', 'STORM_ACTIVE', 'SUBSIDING'] and l1_plasma_list:
            self._update_speed_from_l1(cme, l1_plasma_list)

    def _update_speed_from_l1(self, cme, l1_plasma_list):
        """Update speed_current from recent L1 plasma measurements"""
        # Plasma columns: [time(0), density(1), speed(2), temp(3)]
        recent_speeds = []
        for p in l1_plasma_list[-30:]:
            if isinstance(p, (list, tuple)) and len(p) > 2:
                speed = p[2]
                if isinstance(speed, (int, float)) and speed > 0:
                    recent_speeds.append(speed)
            elif isinstance(p, dict) and 'speed' in p:
                speed = p['speed']
                if speed and speed > 0:
                    recent_speeds.append(speed)
        if recent_speeds:
            avg_speed = sum(recent_speeds) / len(recent_speeds)
            cme['properties']['speed_current'] = round(avg_speed)

    def _check_confirmed_arrival(self, cme, l1_mag, l1_plasma, g_level):
        """Check for confirmed CME arrival from official sources or clear L1 signatures.

        G-level confirmation only applies to CMEs whose predicted arrival
        is in the past or within 6 hours — prevents marking future CMEs
        as arrived just because an earlier CME caused a storm.
        """

        # Trigger 1: NOAA G-scale storm active (G1+) — but only if this CME's
        # predicted arrival is plausibly now (ETA past or within 6h)
        if g_level and g_level.startswith('G') and g_level != 'G0':
            try:
                g_num = int(g_level[1])
                if g_num >= 1:
                    eta = self._calculate_eta(cme)
                    if eta is not None and eta <= 6:
                        self.log.info(f"CME {cme.get('id')}: Confirmed arrival — NOAA {g_level} + ETA {eta:.1f}h")
                        return True
            except (ValueError, IndexError):
                pass

        # Trigger 2: Direct ejecta detection in L1 (reuse existing method)
        if self._detect_ejecta_in_situ(l1_mag, l1_plasma):
            self.log.info(f"CME {cme.get('id')}: Confirmed arrival — L1 ejecta detected")
            return True

        return False
    
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
        """WATCH → INBOUND triggers (sensors OR ETA-based)"""

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

        # ETA-based fallback: scoreboard says CME arrives within 24h
        eta_hours = self._calculate_eta(cme)
        if eta_hours is not None and eta_hours < 24:
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
        # Plasma columns: [time(0), density(1), speed(2), temp(3)]
        if l1_plasma and len(l1_plasma) > 30:
            recent = l1_plasma[-30:]
            speeds = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 2:
                    v = p[2]
                    if isinstance(v, (int, float)):
                        speeds.append(v)
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
        """IMMINENT → ARRIVED triggers with direct in-situ ejecta detection"""
        
        # PRIMARY: Direct in-situ ejecta detection (ported from CME_Watch)
        # This catches CMEs where shock V-jump baseline was already elevated
        # Requires: Bt > 10nT AND V > 450km/s AND sustained southward Bz
        if self._detect_ejecta_in_situ(l1_mag, l1_plasma):
            return 'ARRIVED'
        
        # SECONDARY: Traditional threshold checks
        
        # Trigger 1: Magnetic field jump (LOWERED: 15 → 10 nT)
        if l1_mag and len(l1_mag) > 10:
            recent = l1_mag[-10:]
            bt_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 4:
                    bt_values.append(p[4])  # Bt column
                elif isinstance(p, dict) and 'bt' in p:
                    bt_values.append(p['bt'])
            
            if bt_values and max(bt_values) > 10:  # LOWERED from 15
                return 'ARRIVED'
        
        # Trigger 2: Velocity spike (LOWERED: 550 → 500 km/s)
        # Plasma columns: [time(0), density(1), speed(2), temp(3)]
        if l1_plasma and len(l1_plasma) > 10:
            recent = l1_plasma[-10:]
            speeds = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 2:
                    v = p[2]
                    if isinstance(v, (int, float)):
                        speeds.append(v)
                elif isinstance(p, dict) and 'speed' in p:
                    speeds.append(p['speed'])

            if speeds and max(speeds) > 500:  # LOWERED from 550
                return 'ARRIVED'

        # Trigger 3: Density spike (NEW)
        if l1_plasma and len(l1_plasma) > 10:
            recent = l1_plasma[-10:]
            densities = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 1:
                    d = p[1]  # Density is index 1
                    if isinstance(d, (int, float)):
                        densities.append(d)
                elif isinstance(p, dict) and 'density' in p:
                    densities.append(p['density'])
            
            if densities and max(densities) > 15:  # Density compression
                return 'ARRIVED'
        
        # Trigger 4: ETA passed (NEW - fallback if CME missed detection)
        eta_hours = self._calculate_eta(cme)
        if eta_hours is not None and eta_hours <= 0:  # Past predicted arrival
            return 'ARRIVED'
        
        return 'IMMINENT'
    
    def _detect_ejecta_in_situ(self, l1_mag, l1_plasma):
        """
        Direct in-situ ejecta detection (ported from CME_Watch state_machine.py)
        
        Detects CME arrival by checking for COMBINED signatures:
        - Bt > 10nT (elevated magnetic field)
        - V > 450 km/s (elevated velocity)
        - Sustained southward Bz (>50% of readings < -3nT)
        
        This catches cases where traditional shock detection fails because
        the baseline window already contains CME wind.
        
        Returns: True if ejecta is in-situ, False otherwise
        """
        if not l1_mag or not l1_plasma:
            return False
        
        # Need at least 1 hour of recent data
        if len(l1_mag) < 60 or len(l1_plasma) < 60:
            return False
        
        # Extract last hour of data
        recent_mag = l1_mag[-60:]
        recent_plasma = l1_plasma[-60:]
        
        # Extract Bt values
        bt_values = []
        for p in recent_mag:
            if isinstance(p, (list, tuple)) and len(p) > 4:
                if p[4] is not None:
                    bt_values.append(p[4])
            elif isinstance(p, dict) and 'bt' in p and p['bt'] is not None:
                bt_values.append(p['bt'])
        
        # Extract Bz values
        # Mag columns: [time(0), bx(1), by(2), bz(3), bt(4), phi(5)]
        bz_values = []
        for p in recent_mag:
            if isinstance(p, (list, tuple)) and len(p) > 3:
                if isinstance(p[3], (int, float)):
                    bz_values.append(p[3])
            elif isinstance(p, dict) and 'bz' in p and p['bz'] is not None:
                bz_values.append(p['bz'])

        # Extract V values
        # Plasma columns: [time(0), density(1), speed(2), temp(3)]
        v_values = []
        for p in recent_plasma:
            if isinstance(p, (list, tuple)) and len(p) > 2:
                if isinstance(p[2], (int, float)):
                    v_values.append(p[2])
            elif isinstance(p, dict) and 'speed' in p and p['speed'] is not None:
                v_values.append(p['speed'])
        
        # Need sufficient data
        if len(bt_values) < 10 or len(bz_values) < 10 or len(v_values) < 10:
            return False
        
        # Check conditions
        bt_ok = sum(bt_values) / len(bt_values) > 10.0  # Mean Bt > 10nT
        v_ok = sorted(v_values)[len(v_values)//2] > 450.0  # Median V > 450 km/s
        bz_ok = sum(1 for bz in bz_values if bz < -3.0) / len(bz_values) > 0.50  # >50% southward
        
        return bt_ok and v_ok and bz_ok
    
    def _check_arrived_to_storm(self, cme, l1_mag):
        """ARRIVED → STORM_ACTIVE triggers"""
        # Mag columns: [time(0), bx(1), by(2), bz(3), bt(4), phi(5)]
        if l1_mag and len(l1_mag) > 30:
            recent = l1_mag[-30:]
            bz_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 3:
                    if isinstance(p[3], (int, float)):
                        bz_values.append(p[3])
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
        # Mag columns: [time(0), bx(1), by(2), bz(3), bt(4), phi(5)]
        if l1_mag and len(l1_mag) > 30:
            recent = l1_mag[-30:]
            bz_values = []
            for p in recent:
                if isinstance(p, (list, tuple)) and len(p) > 3:
                    if isinstance(p[3], (int, float)):
                        bz_values.append(p[3])
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
        """Calculate ETA hours - PRIORITIZE SCOREBOARD (NASA consensus)"""
        from datetime import datetime, timezone
        
        # Priority 1: Scoreboard median prediction (NASA consensus - ground truth)
        if cme.get('arrival', {}).get('median_prediction'):
            now = datetime.now(timezone.utc).timestamp()
            return (cme['arrival']['median_prediction'] - now) / 3600
        
        # Priority 2: Scoreboard average prediction
        if cme.get('arrival', {}).get('average_prediction'):
            now = datetime.now(timezone.utc).timestamp()
            return (cme['arrival']['average_prediction'] - now) / 3600
        
        # Priority 3: Position calculator's ETA (from DBM model - fallback only)
        if 'position' in cme and 'eta_hours' in cme['position']:
            eta = cme['position']['eta_hours']
            # TYPE-SAFE: Ensure eta_hours is a float, not a string
            return float(eta) if eta is not None else None
        
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
