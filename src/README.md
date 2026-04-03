# V11 FIXES - CME Dashboard Improvements

## 📦 WHAT'S INCLUDED:

### ✅ COMPLETE FIXES:
1. **CME Persistent Numbering & Coloring** (#5)
   - Numbers assigned by launch order (oldest = #1)
   - Display sorted by distance (nearest Earth = top)
   - Numbers/colors stick with CME until it clears
   - Colors reused from available pool
   - Reset only when board is empty

2. **Diffuse Outer Glow** (#6)
   - Triple-layer Gaussian blur filters
   - Throbs with existing animation

3. **Classification Tab Improvements** (#2, #3, #4)
   - Tighter padding (reduced from 20px to 12px top, 18px to 14px bottom)
   - Drag crosshair (follows finger, no tap required)
   - Phi plotting: 0-360° range (NOAA standard)
   - Sector backgrounds: Blue (0-180° Away), Pink (180-360° Toward)
   - Date/time label on crosshair: "Apr 3, 3:24 PM"

### ⚠️ SPACE WEATHER PANEL (#1)
**NOT INCLUDED** - Requires changes to main app file, not CME components.

**What needs to be done:**
Add date/time label to crosshair in `src/components/SpaceWeatherPanel.jsx`
(Same implementation as Classification tab)

---

## 🚀 DEPLOYMENT:

### STEP 1: Extract files
- `components/` → Copy to `src/components/`
- `hooks/` → Copy to `src/hooks/`

### STEP 2: Deploy
```bash
cd "C:\GitHub Repos\night-watch"
git add src/components/CME* src/hooks/useCMEData.js
git commit -m "CME Dashboard V11 - persistent numbering, diffuse glow, classification improvements"
git pull --rebase origin main
git push origin main
```

---

## 📋 WHAT CHANGED:

### CMEQueueTab.jsx
- Added persistent registry for CME numbers/colors
- Sort by launch_time for numbering
- Sort by distance_au for display
- Registry persists across renders
- Auto-resets when board clears

### CMEPositionViz.jsx
- Uses registry for colors and numbers
- Added diffuse glow filters (feGaussianBlur: 8px, 15px, 25px)
- Glow throbs with existing animation

### CMEClassificationTab.jsx
- Reduced padding: PAD_T=12 (was 20), PAD_B=14 (was 18)
- Drag crosshair: onTouchMove + onMouseMove handlers
- Phi: 0-360° range with sector backgrounds
- Date/time label: "Apr 3, 3:24 PM" at top of crosshair
- Phi normalization: wraps negative values to 0-360°

### CMEDashboard.jsx
- Passes registry between Queue and Classification tabs
- Registry state managed at dashboard level

---

## 🎯 TESTING CHECKLIST:

- [ ] CME #1 is oldest launch, displayed at top if nearest
- [ ] CME cards swap positions if one overtakes another
- [ ] Numbers/colors stay with CME until it clears
- [ ] After all CMEs clear, next one is #1 again
- [ ] No duplicate numbers or colors at any time
- [ ] CME dots have soft outer glow that pulses
- [ ] Classification plots tighter, more space efficient
- [ ] Drag finger across classification plots = crosshair follows
- [ ] Phi shows 0-360° range with blue/pink sectors
- [ ] Crosshair shows "Apr 3, 3:24 PM" style label

---

## 📝 NOTES:

**Registry Persistence:**
- Registry tracks CME ID → {number, color, launchTime}
- Survives re-renders via useState
- Clears only when cmes array is empty
- Numbers assigned sequentially by launch order
- Colors assigned from available pool

**Color Pool Management:**
- 8 colors available: Cyan, Magenta, Green, Yellow, Pink, Blue, Orange, Lime
- Tracks which colors are in use
- Reuses colors from pool when CME clears
- Never duplicates while CME is active

**Phi Sector Logic:**
- 0-180°: Away sector (blue background)
- 180-360°: Toward sector (pink background)
- Matches NOAA standard exactly

**Known Limitation:**
- Space Weather panel (#1) still needs manual update
- Same pattern as Classification tab can be used
- Add date/time label to crosshair display

---

**All CME Dashboard fixes complete!** 🎯
