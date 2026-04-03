# Bothmer-Schwenn Classification Cheat Sheet
## Quick Reference Guide for Flux Rope Typing

**Version:** 1.0  
**Purpose:** Rapid classification reference for CME magnetic field structures  
**Target Audience:** Analysts, forecasters, developers

---

## What Am I Looking At?

You're analyzing magnetic field data from a CME passing Earth. Your job: figure out which of 8 types it is.

**Data you have:**
- Bx, By, Bz (magnetic field components in GSM coordinates)
- Phi angle (φ = arctan(By/Bx)) 
- Time series spanning the CME passage

---

## The 3 Questions

### Q1: Which way does Bz rotate?
- **South→North (SN)**: Bz starts negative, ends positive
- **North→South (NS)**: Bz starts positive, ends negative

### Q2: Which way does the axis point?
- **East (E)**: Mean By positive
- **West (W)**: Mean By negative

### Q3: How much does Bz change?
- **Large swing** (>15 nT range): Low inclination (axis near ecliptic)
- **Small swing** (<10 nT range): High inclination or low Bt

---

## The 8 Types at a Glance

| Type | Bz Rotation | By Sign | Bz Swing | South When? | Duration | Aurora |
|------|-------------|---------|----------|-------------|----------|--------|
| **SEN** | S→N | East (+) | Large | LEADING | 2-4h | ⭐⭐⭐ |
| **SWN** | S→N | West (−) | Large | LEADING | 2-3h | ⭐⭐⭐ |
| **NES** | N→S | East (+) | Large | TRAILING | 4-8h | ⭐⭐⭐⭐⭐ BEST |
| **NWS** | N→S | West (−) | Large | TRAILING | 3-6h | ⭐⭐⭐⭐⭐ BEST |
| **ESW** | Small/South | East (+) | Small/All | THROUGHOUT | 6-12h | ⭐⭐⭐⭐⭐ EXTREME |
| **WSE** | Small/South | West (−) | Small/All | THROUGHOUT | 6-12h | ⭐⭐⭐⭐⭐ EXTREME |
| **ENW** | Small/North | East (+) | Small/All | NEVER | — | ☆ NONE |
| **WNE** | Small/North | West (−) | Small/All | NEVER | — | ☆ NONE |

---

## Decision Tree

```
START HERE:

Does Bz show a LARGE rotation (>15 nT swing)?
│
├─ YES → LOW INCLINATION (4 types: SEN, SWN, NES, NWS)
│   │
│   └─ Does Bz go South→North or North→South?
│       │
│       ├─ South→North (SN)
│       │   │
│       │   └─ Is mean By positive or negative?
│       │       ├─ Positive → SEN (South-East-North) ⭐⭐⭐
│       │       └─ Negative → SWN (South-West-North) ⭐⭐⭐
│       │
│       └─ North→South (NS)
│           │
│           └─ Is mean By positive or negative?
│               ├─ Positive → NES (North-East-South) ⭐⭐⭐⭐⭐ BEST
│               └─ Negative → NWS (North-West-South) ⭐⭐⭐⭐⭐ BEST
│
└─ NO → HIGH INCLINATION or THROUGHOUT (4 types: ESW, WSE, ENW, WNE)
    │
    └─ Does Bz stay mostly SOUTH or mostly NORTH?
        │
        ├─ Mostly SOUTH (Bz <0 for >70% of event)
        │   │
        │   └─ Is mean By positive or negative?
        │       ├─ Positive → ESW (East-South-West) ⭐⭐⭐⭐⭐ EXTREME
        │       └─ Negative → WSE (West-South-East) ⭐⭐⭐⭐⭐ EXTREME
        │
        └─ Mostly NORTH (Bz >0 for >70% of event)
            │
            └─ Is mean By positive or negative?
                ├─ Positive → ENW (East-North-West) ☆ NO AURORA
                └─ Negative → WNE (West-North-East) ☆ NO AURORA
```

---

## Common Patterns (Visual Recognition)

### SEN Pattern
```
Bz:  ━━━━━━╲╲╲╲╲╲━━━━━━  (South, rises to North)
By:  ━━━━━━━━━━━━━━━━━  (Positive throughout)
Phi: ━━━━━━━━━━━━━━━━━  (Slowly changing)
```

### NES Pattern (BEST FOR AURORA)
```
Bz:  ━━━━━━╱╱╱╱╱╱━━━━━━  (North, drops to South)
By:  ━━━━━━━━━━━━━━━━━  (Positive throughout)
Phi: ━━━━━━━━━━━━━━━━━  (Slowly changing)
```

### ESW Pattern (RARE BUT EXTREME)
```
Bz:  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  (South entire time)
By:  ━━━━━━━━━━━━━━━━━  (Positive throughout)
Phi: ━━━━━━━━━━━━━━━━━  (Minimal change)
```

---

## Step-by-Step Classification Procedure

### STEP 1: IDENTIFY FLUX ROPE INTERVAL
- [ ] Tp < 0.5 × Texp? (low temperature)
- [ ] |B| enhanced (>10 nT)? 
- [ ] Smooth rotation (low variance)?
- **If YES to all** → Proceed to STEP 2

### STEP 2: FIND WINDOW BOUNDARIES

**Start**: Shock arrival (V-jump ≥50 km/s)

**End**: Type-dependent (see table below)

| If you think it's | Window ends when |
|-------------------|------------------|
| SEN/SWN/NES/NWS | Phi rotates ~180° AND Bz north >30 min |
| ESW/WSE | Bz north >1h OR 8h elapsed |
| ENW/WNE | 4 hours |

### STEP 3: CALCULATE Bz SWING

```python
bz_min = min(Bz in window)
bz_max = max(Bz in window)
bz_swing = bz_max - bz_min

if bz_swing > 15:
    inclination = "LOW"  # Bipolar
else:
    inclination = "HIGH"  # Unipolar or throughout
```

### STEP 4: DETERMINE ROTATION DIRECTION (if LOW inclination)

```python
if bz at start < 0 and bz at end > 0:
    rotation = "SN"  # South-to-North
elif bz at start > 0 and bz at end < 0:
    rotation = "NS"  # North-to-South
```

### STEP 5: DETERMINE BY POLARITY

```python
mean_by = mean(By in window)
if mean_by > 0:
    axial_direction = "E"  # East
else:
    axial_direction = "W"  # West
```

### STEP 6: DETERMINE DOMINANT Bz (if HIGH inclination)

```python
time_bz_south = count(Bz < 0 in window)
time_bz_north = count(Bz > 0 in window)

if time_bz_south > time_bz_north:
    dominant = "SOUTH"
else:
    dominant = "NORTH"
```

### STEP 7: COMBINE → TYPE

```python
if inclination == "LOW":
    if rotation == "SN":
        type = "SEN" if axial_direction == "E" else "SWN"
    else:  # NS
        type = "NES" if axial_direction == "E" else "NWS"
else:  # HIGH
    if dominant == "SOUTH":
        type = "ESW" if axial_direction == "E" else "WSE"
    else:  # NORTH
        type = "ENW" if axial_direction == "E" else "WNE"
```

---

## Confidence Scoring

**Start with 100%, subtract:**
- −10% if temperature signature weak (0.3 × Texp < Tp < 0.5 × Texp)
- −15% if variance high (σB/B > 0.5)
- −10% if Bz swing ambiguous (10-15 nT range)
- −10% if By near zero (|mean By| < 2 nT)
- −20% if composition data unavailable
- −10% if major phi shift detected mid-window (possible boundary)

**Bonus:**
- +10% if bidirectional electrons present
- +10% if O⁷⁺/O⁶⁺ ratio >0.15 (strong composition signal)
- +5% if classification stable over last 3 runs

**Final confidence = max(0, 100 - penalties + bonuses)**

---

## Edge Cases & Troubleshooting

### Problem: Bz swing is 12 nT (ambiguous)
**Solution**: Look at phi rotation
- Phi rotates ~180° → LOW inclination (SEN/SWN/NES/NWS)
- Phi rotates <60° → HIGH inclination (ESW/WSE/ENW/WNE)

### Problem: By oscillates around zero
**Solution**: Use median By instead of mean
- Still ambiguous? → Flag confidence <60%, prefer "most aurora-relevant" type (NES/NWS if rotation suggests it)

### Problem: Multiple rotations in window
**Solution**: BOUNDARY detected
- Split into segments
- Classify each segment separately  
- Mark earlier segments as "OBSOLETE"

### Problem: Classification keeps changing
**Solution**: Apply auto-revert logic
- If current disagrees with last 5 runs AND confidence not +15% higher → Revert to mode of last 5

### Problem: Very short duration (<2 hours)
**Solution**: Likely caught only flank of flux rope
- Flag confidence <50%
- Provide "Partial observation, classification uncertain"

### Problem: ENW or WNE classified (no aurora potential)
**Solution**: Double-check
- Is Bz really north throughout?
- Could this be a SEN/SWN that hasn't rotated fully yet? (Extend window if within 12h limit)
- If confirmed ENW/WNE → Notify user "This CME will NOT produce auroras"

---

## Bz Prediction Templates

### For Each Type

#### SEN
```
"Southward magnetic field NOW at leading edge. 
Aurora onset: IMMEDIATE
Expected duration: 2-4 hours
Peak Bz: ~{0.6 × current_Bt} nT south ±40%
Status: ACTIVE - monitor for rapid weakening"
```

#### NES (BEST)
```
"Northward field currently, southward rotation BUILDING. 
Aurora onset: +4-6 hours  
Expected duration: 4-8 hours (SUSTAINED)
Peak Bz: ~{0.7 × current_Bt} nT south ±40%
Status: BUILDING - prime aurora window approaching"
```

#### ESW/WSE (EXTREME)
```
"Strong southward field THROUGHOUT passage.
Aurora onset: NOW and CONTINUING
Expected duration: 6-12+ hours (PROLONGED)
Peak Bz: ~{0.9 × current_Bt} nT south ±40%
Status: EXTREME EVENT - major geomagnetic storm in progress"
```

#### ENW/WNE (NO AURORA)
```
"Northward magnetic field throughout passage.
Aurora potential: NONE
This CME will NOT produce auroras.
Status: Geoeffectiveness minimal"
```

---

## Quick Aurora Forecasting

**Given a classified CME, predict Kp:**

| Bz Peak (nT) | Duration (h) | Expected Kp | Aurora Latitude |
|--------------|--------------|-------------|-----------------|
| −5 to −10 | 2-4 | Kp 4-5 | 55-60° (Canada/N.Europe) |
| −10 to −15 | 4-6 | Kp 5-6 | 50-55° (N.US/Scotland) |
| −15 to −20 | 4-8 | Kp 6-7 | 45-50° (border states) |
| −20 to −30 | 6+ | Kp 7-8 | 40-45° (mid-latitudes) |
| >−30 | 8+ | Kp 8-9 | 35°+ (EXTREME - widespread) |

**Combine Type + Bz:**
- **NES/NWS** with Bz −15 nT, 6h → Kp 6-7 (EXCELLENT aurora, sustained)
- **SEN/SWN** with Bz −20 nT, 3h → Kp 6 (GOOD aurora, brief)
- **ESW/WSE** with Bz −25 nT, 10h → Kp 8-9 (EXTREME aurora, all-night show)

---

## Critical Thresholds Reference

### Phi Rotation Rates
- **Smooth flux rope** (normal): 10-30°/hour
- **Possible boundary**: 60-100° in 10-20 min
- **Definite boundary**: >135° in <10 min (13.5°/min)

### Temperature Signatures
```python
Texp = 0.031 * V^0.78  # V in km/s

# ICME detection
if Tp < 0.5 * Texp:
    strong_signal = (Tp < 0.3 * Texp)
    weak_signal = (0.3 * Texp < Tp < 0.5 * Texp)
```

### Composition Thresholds
- **O⁷⁺/O⁶⁺ ratio**:
  - Ambient: 0.01-0.04
  - ICME signature: >0.08
  - Strong ICME: >0.15

- **Fe charge state**:
  - Ambient: <Q_Fe> = 9-10
  - ICME signature: >11
  - Strong ICME: >13

### Plasma Beta
- **Ejecta**: β < 0.6 (magnetic pressure dominant)
- **Sheath**: β > 1.0 (thermal pressure dominant)
- **Boundary layer**: β ≈ 0.6-1.0

### Shock Detection
- **V-jump**: ≥50 km/s sustained >10 minutes
- **Density jump**: Factor of 2-4 typical
- **Temperature jump**: Factor of 4-10 typical
- **B jump**: Factor of 2-3 typical

---

## HCS vs Structure Boundary Detection

```python
# Detect major phi shift
if abs(delta_phi) > 135 and delta_time < 10:  # degrees, minutes
    
    # Check for HCS pattern
    bx_flips = (Bx[t] * Bx[t-1] < 0)
    phi_rotates_180 = (abs(delta_phi) > 160)
    
    if bx_flips and phi_rotates_180:
        event_type = "HCS_CROSSING"  # Expected, benign
        color = "slate_blue"
        action = "IGNORE"
    else:
        event_type = "STRUCTURE_BOUNDARY"  # Unexpected
        color = "orange"
        action = "CHECK_COMPOSITION"
        
        # If composition changes → different CME
        # If no change → boundary within same CME
```

---

## Final Checklist

Before submitting classification:

- [ ] Window boundaries clearly defined (shock to end criteria)
- [ ] All 3 signatures checked (temp, B enhancement, rotation)
- [ ] Bz swing measured (determines LOW vs HIGH)
- [ ] Rotation direction determined (SN vs NS) if LOW
- [ ] By polarity calculated (E vs W)
- [ ] Dominant Bz determined (SOUTH vs NORTH) if HIGH
- [ ] Type assigned using decision tree
- [ ] Confidence scored (with penalties/bonuses)
- [ ] Major phi shifts checked (no boundaries mid-window)
- [ ] Bz prediction generated (onset time + duration)
- [ ] Classification stable (not flip-flopping between runs)

**If confidence <55% → Flag for expert review**

---

## Quick Type Summary Cards

### SEN (South-East-North)
- **What**: Bz starts south, rotates to north
- **When**: South field at LEADING edge
- **Duration**: 2-4 hours
- **Aurora**: ⭐⭐⭐ Good but brief
- **Best for**: Quick alerts

### SWN (South-West-North)
- **What**: Bz starts south, rotates to north
- **When**: South field at LEADING edge  
- **Duration**: 2-3 hours
- **Aurora**: ⭐⭐⭐ Good but brief
- **Best for**: Quick alerts

### NES (North-East-South) ⭐ BEST
- **What**: Bz starts north, rotates to south
- **When**: South field at TRAILING edge
- **Duration**: 4-8 hours
- **Aurora**: ⭐⭐⭐⭐⭐ Excellent & sustained
- **Best for**: Prime aurora hunting

### NWS (North-West-South) ⭐ BEST
- **What**: Bz starts north, rotates to south
- **When**: South field at TRAILING edge
- **Duration**: 3-6 hours
- **Aurora**: ⭐⭐⭐⭐⭐ Excellent & sustained
- **Best for**: Prime aurora hunting

### ESW (East-South-West) ⚡ EXTREME
- **What**: Bz south throughout
- **When**: South field ENTIRE passage
- **Duration**: 6-12+ hours
- **Aurora**: ⭐⭐⭐⭐⭐ Extreme event
- **Best for**: Major storm warnings

### WSE (West-South-East) ⚡ EXTREME
- **What**: Bz south throughout
- **When**: South field ENTIRE passage
- **Duration**: 6-12+ hours
- **Aurora**: ⭐⭐⭐⭐⭐ Extreme event
- **Best for**: Major storm warnings

### ENW (East-North-West)
- **What**: Bz north throughout
- **When**: NEVER south
- **Duration**: N/A
- **Aurora**: ☆ None
- **Best for**: "All clear" notifications

### WNE (West-North-East)
- **What**: Bz north throughout
- **When**: NEVER south
- **Duration**: N/A
- **Aurora**: ☆ None
- **Best for**: "All clear" notifications

---

## Simplified 4-Type Version (MVP)

For initial implementation, combine into 4 categories:

1. **SOUTH_LEADING** (SEN + SWN)
   - South now, 2-4h duration
   - ⭐⭐⭐ Good aurora

2. **SOUTH_TRAILING** (NES + NWS)
   - South in 4-6h, 4-8h duration
   - ⭐⭐⭐⭐⭐ Best aurora

3. **SOUTH_THROUGHOUT** (ESW + WSE)
   - South now and continuing, 6-12h duration
   - ⭐⭐⭐⭐⭐ Extreme aurora

4. **NORTH_THROUGHOUT** (ENW + WNE)
   - No aurora
   - ☆ All clear

**Upgrade to full 8-type later for increased precision**

---

**END OF CHEAT SHEET**

**Quick Access Summary:**
- 8 types based on 3 properties (rotation, axis, inclination)
- NES/NWS = best for aurora (south at trailing edge, long duration)
- ESW/WSE = extreme events (south throughout)
- ENW/WNE = no aurora (north throughout)
- Confidence >55% for operational use
- Major phi shift >135°/10min = boundary detection required
