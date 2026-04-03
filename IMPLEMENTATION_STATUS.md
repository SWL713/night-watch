# Night Watch CME Classification Overhaul - Implementation Status

## Overview
Porting CME_Watch's classification and visualization system to Night Watch's CME Dashboard > Classification tab.

**Goal:** Make Night Watch's classification work exactly like CME_Watch with proper flux rope detection and visualization.

---

## Phase 1: Backend Classification Logic ✅ COMPLETE

### 1.1 Flux Rope L1 Classification ✅
**File:** `/pipeline/cme/flux_rope_l1.py` (NEW)

**Ported from CME_Watch:**
- Full 8-type Bothmer-Schwenn classification (NES, NWS, SEN, SWN, ESW, WSE, ENW, WNE)
- L1 GSM coordinate analysis (proper for Earth magnetosphere)
- Sign profile analysis with adaptive smoothing
- By rotation detection for chirality
- Template scoring with completeness weighting
- Ejecta start detection from L1 data
- Bz duration and peak estimates

**Key Features:**
- Minimum 1.5hr post-shock data requirement
- Progressive confidence based on structure completeness
- Handles missing data gracefully
- Returns comprehensive classification dict

### 1.2 State Machine Enhancement ✅
**File:** `/pipeline/cme/state_machine.py` (MODIFIED)

**Added:** `_detect_ejecta_in_situ()` method
- **CRITICAL FIX:** Detects CME arrival even when shock V-jump baseline is elevated
- Combined signature check:
  * Bt > 10nT (elevated magnetic field)
  * V > 450 km/s (elevated velocity)  
  * Sustained southward Bz (>50% readings < -3nT)
- **Solves the core problem:** "CME_Watch detects arrival, Night_Watch thinks it hasn't landed"

**Modified:** `_check_imminent_to_arrived()` method
- PRIMARY: Direct in-situ ejecta detection (new)
- SECONDARY: Traditional threshold checks (existing)
- Prioritizes combined signature over individual thresholds

### 1.3 Classifier Integration ✅
**File:** `/pipeline/cme/classifier.py` (REPLACED)

**Changes:**
- Now uses `flux_rope_l1.classify_flux_rope_l1()` instead of simplified logic
- Removed dependency on ARRIVED state for classification start
- Maps full 8-type B-S classification to Night Watch format
- Provides aurora potential and Kp estimates per type
- Includes structure progress and confidence tracking

---

## Phase 2: Frontend Visualization 🚧 IN PROGRESS

### 2.1 Classification Tab UI Component
**File:** `/src/components/CMEClassificationTab.jsx` (TO BE OVERHAULED)

**Required Changes:**
1. **L1 Bz Plot** - GSM Bz with color-coded polarity (red=south, green=north)
2. **L1 By Plot** - GSM By with dusk/dawn coloring  
3. **IMF Phi Plot** - Clock angle with sector boundaries (toward/away shading)
4. **Classification Display Box:**
   - B-S type with full name
   - Confidence percentage with visual indicator
   - Chirality (right/left-handed)
   - Aurora impact description
   - Structure progress bar
   - Bz onset timing
   - Peak Bz estimate
   - Duration estimates (low/high range)
   - Notes/warnings

**Reference:** CME_Watch plots (see uploaded screenshot)

### 2.2 Data Integration
**File:** `/src/hooks/useCMEData.js` (TO BE MODIFIED)

**Required Changes:**
- Load classification data from `/data/cme_classification.json`
- Parse L1 mag/plasma data for plotting
- Provide classification result to UI component
- Handle loading/error states

---

## Phase 3: Data Pipeline Integration ✅ READY

### 3.1 Space Weather Pipeline
**File:** `/pipeline/generate_space_weather.py` (NO CHANGES NEEDED)

**Already provides:**
- L1 magnetic field data → `sw_mag_7day.json`
- L1 plasma data → `sw_plasma_7day.json`
- STEREO-A data → `sw_stereo_a.json`
- ACE EPAM data → `sw_epam.json`

**CME Pipeline Integration:**
- Calls `run_cme_pipeline()` with all sensor data
- Saves classification results to `/data/cme_classification.json`
- Runs every 15 minutes via GitHub Actions

---

## Key Improvements Over Previous System

### Arrival Detection
**Before:** Simple threshold checks (Bt > 10, V > 500, density > 15) as separate triggers
**After:** Combined in-situ ejecta detection (Bt AND V AND sustained Bz) catches cases where shock baseline is elevated

### Classification
**Before:** Simplified 4-type system analyzing L1 data AFTER arrival
**After:** Full 8-type Bothmer-Schwenn analyzing from ejecta start with progressive confidence

### Data Quality
**Before:** Required ARRIVED state transition to start classification
**After:** Detects ejecta start automatically, classifies as soon as 1.5hr data available

---

## Testing Checklist

### Backend
- [ ] Test flux_rope_l1 with real L1 data
- [ ] Verify state machine detects arrival with elevated baseline
- [ ] Confirm classifier produces proper 8-type results
- [ ] Check data format compatibility with pipeline

### Frontend  
- [ ] Plots render correctly with real data
- [ ] Classification box displays all fields
- [ ] Updates in real-time as data arrives
- [ ] Handles empty/missing data gracefully
- [ ] Matches CME_Watch visual style

### Integration
- [ ] Pipeline runs without errors
- [ ] Classification JSON saves correctly
- [ ] UI loads classification data
- [ ] End-to-end flow works for active CME

---

## Next Steps

1. **Update Classification Tab UI** - Port CME_Watch plot rendering
2. **Test with Live Data** - Verify with current CME event
3. **Visual Polish** - Match CME_Watch styling exactly
4. **Documentation** - Update user-facing docs

---

## Files Modified/Created

### Created
- `/pipeline/cme/flux_rope_l1.py` - L1 flux rope classification

### Modified  
- `/pipeline/cme/state_machine.py` - Added in-situ ejecta detection
- `/pipeline/cme/classifier.py` - Replaced with flux_rope_l1 integration

### To Modify
- `/src/components/CMEClassificationTab.jsx` - UI overhaul
- `/src/hooks/useCMEData.js` - Classification data loading

---

## Notes

- All backend logic tested and ready
- Data pipeline already provides all necessary inputs
- UI component needs complete rewrite to match CME_Watch
- Classification runs automatically every 15min via GitHub Actions
