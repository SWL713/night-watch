
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
