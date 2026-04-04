"""
flux_rope_l1.py — Flux rope classification from L1 GSM data
Ported from CME_Watch for Night Watch integration

This is the PRIMARY classifier. L1 data (DSCOVR/WIND) is:
  - Already in GSM coordinates (no RTN→GSM conversion uncertainty)
  - At Earth's L1 point (no angular separation penalty)
  - The actual field that drives the magnetosphere

Classification logic:
  1. Detect ejecta start from L1 data (V jump, density spike, Bt rise, or known shock_time)
  2. Build Bz/By sign profile across whatever portion has passed
  3. Score against all 8 Bothmer-Schwenn templates
  4. Weight by: data completeness, ΔB/B smoothness, elapsed time

Minimum data requirement: 1.5hr of post-shock L1 data for classification to fire.
"""

import logging
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

BZ_SOUTH = -2.0   # nT threshold for "southward"
BZ_NORTH = +2.0
MIN_ELAPSED_HRS = 1.0   # minimum post-shock data before classification (lowered from 1.5 to match CME_Watch)

# Bothmer-Schwenn 8-type templates (L1 GSM coordinates)
# Format: (bz_early, bz_mid, bz_late, by_rotation, axial_dir)
# by_rotation: +1=By peaks first half (E→W rotation), -1=peaks second half (W→E), 0=neutral
TYPE_TEMPLATES = {
    'NES': ( 1, -1, -1,  1, +1),  # N leading, east axial, S trailing
    'NWS': ( 1,  0, -1,  1, -1),  # N leading, west axial, S trailing
    'SEN': (-1,  1,  1, -1, +1),  # S leading, east axial, N trailing
    'SWN': (-1,  0,  1, -1, -1),  # S leading, west axial, N trailing
    'ESW': ( 0, -1,  0,  0,  0),  # E leading, south axial, W trailing
    'WSE': ( 0, -1,  0,  0,  0),  # W leading, south axial, E trailing
    'ENW': ( 0,  1,  0,  0,  0),  # E leading, north axial, W trailing
    'WNE': ( 0,  1,  0,  0,  0),  # W leading, north axial, E trailing
}

TYPE_AURORA = {
    'NES': 'South mid-to-trailing. Sustained storm.',
    'NWS': 'South trailing edge. Late onset.',
    'SEN': 'South leading edge. Fast onset.',
    'SWN': 'North trailing edge. Weakening.',
    'ESW': 'South throughout passage. Deep prolonged storm.',
    'WSE': 'South throughout passage. Deep prolonged storm.',
    'ENW': 'North throughout. Aurora-unfriendly.',
    'WNE': 'North throughout. Aurora-unfriendly.',
    'unknown': 'Classification in progress.',
}


def _smooth(series, window_pts=30):
    """Rolling mean smooth with given window."""
    if series.empty or len(series) < 3:
        return series
    w = max(3, min(window_pts, len(series) // 3))
    return series.rolling(window=w, center=True, min_periods=max(1, w//3)).mean()


def _sign_profile(bz_arr, n_bins=3, bt_arr=None, smooth_pts=None):
    """
    Split into n_bins, return median Bt-normalized sign of each bin.
    Returns None if insufficient data.
    """
    valid = bz_arr[~np.isnan(bz_arr)]
    if len(valid) < n_bins * 6:
        return None

    # Adaptive smoothing
    if smooth_pts is None:
        smooth_pts = max(10, len(valid) // 12)
    smooth_pts = min(smooth_pts, len(valid) // 3)
    if smooth_pts >= 3 and smooth_pts % 2 == 0:
        smooth_pts += 1
    
    try:
        from scipy.signal import savgol_filter
        smoothed = savgol_filter(valid, window_length=max(3, smooth_pts),
                                polyorder=min(2, smooth_pts - 1))
    except Exception:
        smoothed = valid

    # Bt-relative normalization
    if bt_arr is not None:
        bt_valid = bt_arr[~np.isnan(bt_arr)]
        if len(bt_valid) == len(smoothed):
            bt_median = np.median(bt_valid)
            if bt_median > 0:
                smoothed = smoothed / bt_median

    # Split into bins
    n = len(smoothed)
    bin_size = n // n_bins
    signs = []
    for i in range(n_bins):
        start = i * bin_size
        end = (i + 1) * bin_size if i < n_bins - 1 else n
        segment = smoothed[start:end]
        if len(segment) == 0:
            signs.append(0.0)
        else:
            mean = np.mean(segment)
            signs.append(np.clip(mean / 5.0, -1.0, 1.0))
    
    return signs


def _compute_by_rotation(by_series):
    """
    Determine net By rotation direction.
    Returns +1 if By peaks in first half (right-handed), -1 if second half.
    """
    valid = by_series[~np.isnan(by_series)]
    if len(valid) < 6:
        return 0
    n = len(valid)
    first_half = np.nanmean(valid[:n//2])
    second_half = np.nanmean(valid[n//2:])
    diff = first_half - second_half
    if abs(diff) < 1.0:
        return 0
    return 1 if diff > 0 else -1


def _score_template(sign_profile, by_rotation, template):
    """Score how well observed profile matches template. Returns [0,1]."""
    t_early, t_mid, t_late, t_by, t_axial = template
    observed = np.array(sign_profile)
    expected = np.array([t_early, t_mid, t_late])

    if len(observed) != 3:
        return 0.0

    # Bz sign profile correlation
    if np.std(observed) < 0.01 or np.std(expected) < 0.01:
        bz_corr = 0.5 if np.allclose(np.sign(observed), np.sign(expected), equal_nan=True) else 0.1
    else:
        bz_corr = max(0, np.corrcoef(observed, expected)[0, 1])

    # By rotation agreement
    if t_by == 0:
        by_score = 0.5  # inclined types
    elif by_rotation == 0:
        by_score = 0.4  # insufficient data
    else:
        by_score = 0.8 if by_rotation == t_by else 0.2

    score = 0.70 * bz_corr + 0.30 * by_score
    return float(np.clip(score, 0.0, 1.0))


def detect_ejecta_start(l1_mag_df, l1_plasma_df, shock_time=None):
    """
    Detect ejecta start time from L1 data.
    
    Args:
        l1_mag_df: DataFrame with Bz, By, Bx columns
        l1_plasma_df: DataFrame with V, density columns
        shock_time: Known shock arrival time (if available)
        
    Returns:
        datetime or None
    """
    if shock_time is not None:
        return shock_time
    
    # Look for velocity jump
    if not l1_plasma_df.empty and 'V' in l1_plasma_df.columns:
        v = l1_plasma_df['V'].dropna()
        if len(v) >= 20:
            # Look for sustained elevation
            for i in range(len(v) - 10):
                t = v.index[i]
                bg_start = t - pd.Timedelta(hours=6)
                bg_end = t - pd.Timedelta(minutes=5)
                bg_data = v.loc[bg_start:bg_end]
                if len(bg_data) < 5:
                    continue
                bg_median = bg_data.median()
                
                # Check if V sustained > baseline + 80 km/s for 10+ minutes
                future = v.loc[t:t + pd.Timedelta(minutes=10)]
                if len(future) >= 5 and future.median() > bg_median + 80:
                    return t
    
    # Look for Bt elevation
    if not l1_mag_df.empty:
        for col in ['Bx', 'By', 'Bz']:
            if col not in l1_mag_df.columns:
                return None
        
        bt = np.sqrt(l1_mag_df['Bx']**2 + l1_mag_df['By']**2 + l1_mag_df['Bz']**2)
        bt = bt.dropna()
        if len(bt) >= 20:
            for i in range(len(bt) - 10):
                t = bt.index[i]
                bg = bt.loc[t - pd.Timedelta(hours=6):t - pd.Timedelta(minutes=5)]
                if len(bg) < 5:
                    continue
                
                future = bt.loc[t:t + pd.Timedelta(minutes=10)]
                if len(future) >= 5 and future.median() > bg.median() + 5.0:
                    return t
    
    return None


def classify_flux_rope_l1(l1_mag, l1_plasma, shock_time=None, 
                          structure_duration_hrs=24.0):
    """
    Classify flux rope structure from L1 data.
    
    Args:
        l1_mag: List of mag records or DataFrame with columns: time, Bz, By, Bx
        l1_plasma: List of plasma records or DataFrame with columns: time, V, density
        shock_time: Known shock arrival time (datetime or ISO string)
        structure_duration_hrs: Expected CME structure duration
        
    Returns:
        dict with classification results
    """
    # Convert to DataFrames if needed
    # Data may arrive as: list-of-lists, dict with {columns, data}, or DataFrame
    if isinstance(l1_mag, dict) and 'data' in l1_mag:
        # Mag columns: [time, bx, by, bz, bt, phi] → remap to expected order
        l1_mag_df = _list_to_dataframe(l1_mag['data'], ['time', 'Bx', 'By', 'Bz', 'Bt', 'phi'])
    elif isinstance(l1_mag, list):
        l1_mag_df = _list_to_dataframe(l1_mag, ['time', 'Bx', 'By', 'Bz', 'Bt'])
    else:
        l1_mag_df = l1_mag

    if isinstance(l1_plasma, dict) and 'data' in l1_plasma:
        # Plasma columns: [time, density, speed, temp]
        l1_plasma_df = _list_to_dataframe(l1_plasma['data'], ['time', 'density', 'V', 'temp'])
    elif isinstance(l1_plasma, list):
        l1_plasma_df = _list_to_dataframe(l1_plasma, ['time', 'density', 'V', 'temp'])
    else:
        l1_plasma_df = l1_plasma
    
    # Parse shock_time if string
    if isinstance(shock_time, str):
        try:
            shock_time = pd.Timestamp(shock_time, tz='UTC')
        except:
            shock_time = None
    
    null_result = {
        'type': 'unknown',
        'confidence_pct': 0.0,
        'chirality': 'unknown',
        'aurora_impact': 'Insufficient data for classification.',
        'structure_progress_pct': 0.0,
        'bz_onset_timing': 'unknown',
        'bz_south_duration_hrs_low': None,
        'bz_south_duration_hrs_high': None,
        'peak_bz_estimate_nT': None,
        'insufficient_data': True,
        'notes': []
    }
    
    if l1_mag_df.empty or 'Bz' not in l1_mag_df.columns:
        return {**null_result, 'notes': ['No L1 magnetic field data']}
    
    # Detect ejecta start
    ejecta_start = detect_ejecta_start(l1_mag_df, l1_plasma_df, shock_time)
    
    if ejecta_start is None:
        return {**null_result, 'notes': ['No ejecta arrival detected in L1 data']}
    
    # Check elapsed time (normalize tz to avoid naive/aware mismatch)
    now = l1_mag_df.index.max()
    if now.tzinfo is None and hasattr(ejecta_start, 'tzinfo') and ejecta_start.tzinfo is not None:
        now = now.tz_localize('UTC')
    elif now.tzinfo is not None and (not hasattr(ejecta_start, 'tzinfo') or ejecta_start.tzinfo is None):
        ejecta_start = pd.Timestamp(ejecta_start, tz='UTC')
    elapsed_hrs = (now - ejecta_start).total_seconds() / 3600
    
    if elapsed_hrs < MIN_ELAPSED_HRS:
        return {
            **null_result,
            'structure_progress_pct': (elapsed_hrs / structure_duration_hrs) * 100,
            'notes': [f'Only {elapsed_hrs:.1f}hr elapsed since arrival - need {MIN_ELAPSED_HRS}hr for classification']
        }
    
    structure_progress = min(elapsed_hrs / structure_duration_hrs, 1.0)
    structure_progress_pct = structure_progress * 100
    
    # Extract rope window
    rope_df = l1_mag_df.loc[ejecta_start:]
    
    if len(rope_df) < 20:
        return {
            **null_result,
            'structure_progress_pct': structure_progress_pct,
            'notes': ['Insufficient data points in ejecta window']
        }
    
    # Extract Bz, By, Bt
    bz = rope_df['Bz'].values
    by = rope_df['By'].values if 'By' in rope_df.columns else np.full(len(bz), np.nan)
    
    # Calculate Bt if not present
    if 'Bt' in rope_df.columns:
        bt = rope_df['Bt'].values
    else:
        bx = rope_df['Bx'].values if 'Bx' in rope_df.columns else np.zeros(len(bz))
        bt = np.sqrt(bx**2 + by**2 + bz**2)
    
    # Data quality check
    nan_frac = np.isnan(bz).sum() / len(bz) if len(bz) > 0 else 1.0
    notes = []
    if nan_frac > 0.30:
        notes.append(f"Warning: {nan_frac*100:.0f}% of Bz data missing")
    
    # Generate sign profile
    sign_profile = _sign_profile(bz, n_bins=3, bt_arr=bt)
    if sign_profile is None:
        return {
            **null_result,
            'structure_progress_pct': structure_progress_pct,
            'notes': ['Insufficient Bz data for classification']
        }
    
    by_rotation = _compute_by_rotation(by)
    chirality = 'right-handed' if by_rotation > 0 else ('left-handed' if by_rotation < 0 else 'indeterminate')
    
    # Score against templates
    scores = {}
    for type_name, template in TYPE_TEMPLATES.items():
        scores[type_name] = _score_template(sign_profile, by_rotation, template)
    
    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]
    
    # Completeness weighting
    if structure_progress < 0.20:
        completeness_weight = 0.25
    elif structure_progress < 0.40:
        completeness_weight = 0.50
    elif structure_progress < 0.60:
        completeness_weight = 0.70
    elif structure_progress < 0.80:
        completeness_weight = 0.85
    else:
        completeness_weight = 0.95
    
    raw_confidence = best_score * completeness_weight
    
    # Data quality penalty
    if nan_frac > 0.15:
        raw_confidence *= (1.0 - nan_frac * 0.5)
    
    confidence_pct = float(np.clip(raw_confidence * 100, 0, 95))
    
    if best_score < 0.45:
        best_type = 'unknown'
        notes.append("No template correlation above threshold")
    
    # Bz duration and peak estimates
    valid_bz = bz[~np.isnan(bz)]
    if len(valid_bz) > 0:
        south_fraction = np.sum(valid_bz < BZ_SOUTH) / len(valid_bz)
        bz_south_dur_central = south_fraction * structure_duration_hrs
        bz_south_dur_low = max(0, bz_south_dur_central * 0.6)
        bz_south_dur_high = bz_south_dur_central * 1.5
        
        observed_peak_bz = float(np.nanmin(valid_bz))
    else:
        bz_south_dur_low = bz_south_dur_high = None
        observed_peak_bz = None
    
    # Measure actual -Bz onset from observed data
    bz_south_onset_hrs = None
    bz_series = rope_df['Bz'].dropna()
    if len(bz_series) >= 10:
        # Find first sustained period where Bz < -2 nT for 10+ consecutive minutes
        south_run = 0
        for idx_pos in range(len(bz_series)):
            if bz_series.iloc[idx_pos] < BZ_SOUTH:
                south_run += 1
                if south_run >= 10:
                    onset_idx = idx_pos - south_run + 1
                    onset_time = bz_series.index[onset_idx]
                    bz_south_onset_hrs = (onset_time - ejecta_start).total_seconds() / 3600
                    break
            else:
                south_run = 0

    # Onset timing description
    if bz_south_onset_hrs is not None:
        if bz_south_onset_hrs < 0.5:
            bz_onset_timing = 'immediate (<30 min)'
        elif bz_south_onset_hrs < 3:
            bz_onset_timing = f'early ({bz_south_onset_hrs:.1f}h post-shock)'
        elif bz_south_onset_hrs < 8:
            bz_onset_timing = f'mid-passage ({bz_south_onset_hrs:.1f}h post-shock)'
        else:
            bz_onset_timing = f'late ({bz_south_onset_hrs:.1f}h post-shock)'
    else:
        onset_map = {
            'NES': 'mid-passage (est)', 'SEN': 'leading edge (est)',
            'ESW': 'throughout (est)', 'WSE': 'throughout (est)',
            'NWS': 'trailing edge (est)', 'SWN': 'leading edge (est)',
            'ENW': 'N/A (+Bz throughout)', 'WNE': 'N/A (+Bz throughout)',
            'unknown': 'indeterminate'
        }
        bz_onset_timing = onset_map.get(best_type, 'indeterminate')
    
    return {
        'type': best_type,
        'confidence_pct': confidence_pct,
        'chirality': chirality,
        'aurora_impact': TYPE_AURORA.get(best_type, ''),
        'structure_progress_pct': structure_progress_pct,
        'bz_onset_timing': bz_onset_timing,
        'bz_south_onset_hrs': bz_south_onset_hrs,
        'bz_south_duration_hrs_low': bz_south_dur_low,
        'bz_south_duration_hrs_high': bz_south_dur_high,
        'peak_bz_estimate_nT': observed_peak_bz,
        'insufficient_data': False,
        'ejecta_start_time': ejecta_start.isoformat() if ejecta_start else None,
        'notes': notes
    }


def _list_to_dataframe(data_list, expected_cols):
    """Convert list of records to DataFrame."""
    if not data_list:
        return pd.DataFrame()
    
    rows = []
    for rec in data_list:
        if isinstance(rec, dict):
            rows.append(rec)
        elif isinstance(rec, (list, tuple)) and len(rec) >= len(expected_cols):
            row = dict(zip(expected_cols, rec))
            rows.append(row)
    
    if not rows:
        return pd.DataFrame()
    
    df = pd.DataFrame(rows)
    
    # Convert time column to datetime index
    if 'time' in df.columns:
        df['time'] = pd.to_datetime(df['time'], errors='coerce')
        df = df.dropna(subset=['time'])
        df = df.set_index('time').sort_index()
    
    return df
