// Help content for every tappable UI element.
// Keys match what App.jsx passes to showHelp(key).

export const HELP_CONTENT = {
  timeline: {
    title: 'Timeline',
    text: 'The timeline shows real-time space weather at a glance — Bz, solar wind speed, and proton density. Sun (yellow) and moon (white) markers show rise and set times for your region. The red bounding box marks the currently selected forecast hour — moving the time slider shifts it forward and everything on the map updates to match, including cloud cover and moon interference. Solid lines are measured data, and dashed lines are model-based predictions.',
  },
  legend_strip: {
    title: 'Timeline Legend',
    text: 'Color key for the timeline chart. Sun and moon lines mark rise and set times. −Bz (red) and +Bz (teal) show the north-south component of the interplanetary magnetic field. V is solar wind speed in km/s and n is proton density in particles per cubic centimeter.',
  },
  aurora_image: {
    title: 'Aurora Intensity Image',
    text: 'The aurora image reflects current solar wind driving conditions — shifting from calm to extreme based on real-time data. It gives you an at-a-glance sense of how active conditions are right now or at the selected forecast hour.',
  },
  moon_image: {
    title: 'Moon Phase',
    text: 'Shows the current lunar phase. The moon phase and illumination are used to calculate interference — how much the moon will impact your ability to see and photograph the aurora.',
  },
  bz_readout: {
    title: 'Bz Readout',
    text: 'Bz value in nanoteslas at the latest data update — the north-south component of the interplanetary magnetic field measured at the L1 solar wind monitor. Negative values drive aurora. Updates to show the forecast value when the time slider is moved forward.',
  },
  chase_quality: {
    title: 'Chase Quality',
    text: 'An overall chase quality score for the current or selected hour — combining aurora intensity, astronomical darkness, and moon interference into a single rating.\n\nIntensity: Rates aurora driving strength from Calm to Extreme based on real-time solar wind conditions. Higher intensity means stronger and more widespread aurora pushed further south.\n\nInterference: A measure of how much the moon will impact aurora visibility and photography — combining lunar illumination and its position in the sky. Lower is better. When the moon is below the horizon interference drops to zero regardless of phase.\n\nAstro Dark: A measure of astronomical darkness at the current or selected hour. 0% is full daylight, 100% is reached once the sun is more than 18 degrees below the horizon. The gradient in between covers civil, nautical, and astronomical twilight.',
  },
  intensity: {
    title: 'Intensity',
    text: 'Rates aurora driving strength from Calm to Extreme based on real-time solar wind conditions. Higher intensity means stronger and more widespread aurora pushed further south.',
  },
  interference: {
    title: 'Moon Interference',
    text: 'A measure of how much the moon will impact aurora visibility and photography — combining lunar illumination and its position in the sky. Lower is better. When the moon is below the horizon interference drops to zero regardless of phase.',
  },
  astro_dark: {
    title: 'Astro Dark',
    text: 'A measure of astronomical darkness at the current or selected hour. 0% is full daylight, 100% is reached once the sun is more than 18 degrees below the horizon. The gradient in between covers civil, nautical, and astronomical twilight.',
  },
  g_badge: {
    title: 'NOAA G Scale',
    text: 'Current NOAA geomagnetic storm scale — G1 (minor) to G5 (extreme).',
  },
  hss_badge: {
    title: 'HSS — High Speed Stream',
    text: 'Indicates whether a High Speed Stream from a coronal hole is currently active or has a watch issued.',
  },
  night_mode: {
    title: 'Night Vision Mode',
    text: 'Toggles night vision mode — shifts the entire display to a red tint to preserve your eyes\' dark adaptation when outside.',
  },
  camera_advisor: {
    title: 'Camera Advisor',
    text: 'Tap your shooting location on the map to get personalized camera settings recommendations based on local light pollution, moon interference, and current aurora intensity.',
  },
  clear_sky_finder: {
    title: 'Clear Sky Finder',
    text: 'Scores and ranks cloud cover within your selected radius — showing your best options relative to each other tonight. Your anchor point defaults to your GPS location. Long press anywhere on the map to place a manual anchor and explore from a different origin. Tap X to clear the anchor.\n\nAdjust the travel radius slider to expand or contract your search area. The circle updates in real time and the map zooms to fit. Zones are ranked relative to each other within your radius using the selected 4H or 8H forecast window — BEST is the clearest 20% of points, GOOD the next 20%, and FAIR the next 20%.\n\nOn heavily clouded nights when no good option exists, LONG SHOT mode activates — the circle turns orange and highlights the least-bad spots available.\n\nThe best in radius readout below the circle shows the absolute clearness of your best available spot — green means 60% or more clear, yellow means 40–59% clear, and red means below 40% clear.',
  },
  radius_slider: {
    title: 'Radius Slider',
    text: 'Sets the search radius around your anchor point — drag to expand or contract the area being scored. Everything outside the circle is masked. Scoring renormalizes to only the points inside your selected radius.',
  },
  anchor_marker: {
    title: 'Anchor Point',
    text: 'Your scoring anchor — the center point of the radius search. Defaults to your GPS location when available. Long press anywhere on the map to place a manual anchor and explore from a different origin. Tap X to clear the manual anchor and return to your GPS location.',
  },
  best_in_selection: {
    title: 'Best In Radius',
    text: 'Shows the clearest point inside your current radius as a percentage of clear sky. Updates when the radius changes or cloud data refreshes.',
  },
  time_slider: {
    title: 'Time Slider',
    text: 'Scrubs the cloud cover forecast forward up to 8 hours. All map layers and the timeline bounding box update to reflect conditions at the selected hour.',
  },
  report_aurora: {
    title: 'Report Aurora',
    text: 'Submit a real-time aurora sighting report. You can use your current location or tap anywhere on the map to place it precisely. Sightings appear as rings on the map for other chasers — brighter rings are more recent, fading as the report ages.',
  },
  place_pin: {
    title: 'Place Pin',
    text: 'Tap anywhere on the map to submit a new aurora viewing or photography location. Good spots typically have a clear northward horizon and minimal obstructions. Submissions are added to the community map.',
  },
  layer_clouds: {
    title: 'Cloud Cover Layer',
    text: 'Displays the HRRR cloud cover forecast as a red wash over the map — darker red means heavier cloud cover. Use the time slider to see conditions up to 8 hours ahead.',
  },
  layer_bortle: {
    title: 'Sky Brightness Layer',
    text: 'Displays light pollution levels based on the Lorenz World Atlas 2024. Colors range from faint yellow in moderately dark areas to deep red in heavily light polluted zones. Truly dark sites appear transparent.',
  },
  layer_ovation: {
    title: 'Ovation Model Layer',
    text: 'Shows the NOAA Ovation auroral oval. The solid line and filled band mark the active aurora zone. The dashed line below is the equatorward visibility limit — aurora may be visible on the horizon from near or south of this line.',
  },
  layer_pins: {
    title: 'Locations Layer',
    text: 'Shows community-submitted aurora viewing and photography spots. Pin color reflects active map layers — green to red indicates sky darkness in sky brightness mode, teal to red indicates cloud cover in cloud mode, and combined when both are active. In clear sky mode pins shift teal to red based on forecast cloud cover. Tap any pin to see location details, light pollution rating, horizon notes, cloud cover forecast, and community photos.',
  },
  layer_cameras: {
    title: 'Live Cams Layer',
    text: 'Shows live camera feeds across the region. 📹 is a general camera, 🔭 is an all-sky camera pointing straight up, and ✈️ is an FAA airport weather camera. Tap any marker to see a live snapshot preview and a link to the full stream.',
  },
  layer_sightings: {
    title: 'Active Hunt Layer',
    text: 'Shows real-time aurora sighting reports submitted by the community. Brighter rings are more recent, fading as the report ages. Tap a ring to see details including location, conditions at the time, and who reported it.',
  },
  map_area: {
    title: 'The Map',
    text: 'The map covers the entire world but aurora hunting data, cloud forecasts, and scoring models are focused on the northeast US and southern Canada. Pinch to zoom, drag to pan. Tap any pin, ring, or camera marker for details. Use the layer controls on the left to toggle what\'s displayed.',
  },
  map_search: {
    title: 'Location Search',
    text: 'Search for any city, address, place name, or GPS coordinates to pan the map there. Selecting a result also gives you the option to submit that location as a new aurora viewing spot.',
  },
  sw_cl_timestamps: {
    title: 'Data Timestamps',
    text: 'SW shows when space weather data was last updated. CL shows when the cloud cover forecast was last fetched. Both update automatically in the background — amber or red indicates stale data.',
  },
  recenter: {
    title: 'Return to My Location',
    text: 'Returns the map to your current location.',
  },
  help_button: {
    title: 'Help Mode',
    text: 'Toggles help mode. While active, tap any element on the map or interface to see a description of what it does.',
  },
}
