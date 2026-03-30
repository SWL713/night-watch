
## LOCAL REACH — Deferred Feature

**Concept:** A `!` button in clear sky mode that finds the best available sky within the current viewport when conditions are too poor for normal clear sky zones to appear.

**Design spec:**
- Button appears left of zoom +/- controls when clear sky mode is active
- Greyed out when viewport has ≥10% teal coverage (conditions good enough)
- Active/lit when viewport <10% teal
- On press: freezes current viewport bounds, calculates top 20th percentile of grid points within that viewport, renders as warm teal `rgb(150,210,120)` with dashed orange border at z-index 199 (under normal clear sky zones)
- Renders under normal teal zones so good spots show BEST on top with reach halo at outer edges
- Toggle off: press again to clear
- If user pans while active: zones stay frozen, "⟳ RECALCULATE FOR CURRENT AREA" appears under subtitle
- First press ever shows one-time popup explaining Local Reach
- Key adds REACH swatch (dashed orange border) below FAIR when active

**Why deferred:** Adds meaningful complexity for an edge case. Auto Long Shot mode handles most bad-night scenarios adequately. Revisit when expanding to national coverage where viewport-relative calculation becomes essential.

**Future note:** When coverage expands nationally, Long Shot percentile calculation should become viewport/region-relative (not grid-wide) because a chaser in Maine doesn't care that Montana is clear. Local Reach and regional-relative Long Shot should be built together at that point.

---

## Module Architecture Rules (learned the hard way — 2026-03-30)

A circular dependency through the Leaflet module graph caused a production black screen. Root cause: `SpotPins.jsx` was importing `getAvgCloudForSpot` from `ClearSkyLayer.jsx`. Both import from `react-leaflet`, and Rollup hit a `Cannot access 'yn' before initialization` error at runtime.

**Rules going forward:**

1. **Components never import from other components.** If two components need shared logic, that logic lives in `src/utils/`.

2. **ClearSkyLayer.jsx exports only its default component.** No named utility exports from any component file.

3. **All cloud utility functions live in `src/utils/cloudUtils.js`** — a plain JS file with zero Leaflet imports. Safe to import from anywhere.

4. **Before adding any feature that touches module boundaries:** establish clean imports first as a standalone commit, verify the build passes, then add the feature in a second commit.

5. **The 4H/8H window toggle** is the next planned feature for ClearSkyLayer. It is safe to add now that module boundaries are clean — `windowHours` will be a simple prop, no new imports needed.
