## windows -- window units only

Window units from the window / glazing schedule -- one row per window type/position. Resolve EVERY code through the plan's GLAZING NOTES legend first.

- Legend pattern (Villaworld-style): SS=sliding window, SA=awning, LVR=louvre, SD=double hung, FG=fixed glass, OBS=obscure glass. Sizing = HEIGHT x WIDTH (SS0924 = sliding window 900H x 2400W; 21.18 = 2100H x 1800W).
- `label` / `name`: window code from the schedule (e.g. SS0924, LVR 1809).
- `windowType`: FREE TEXT (not a dropdown) -- e.g. "Sliding", "Awning", "Louvre", "Double Hung", "Fixed", "Obscure".
- `height` / `width`: numbers in mm decoded from the sizing code -- you MAY propose these (document spec).
- `qty`: count of identical windows. `floorLevel`: GF / FF.
- NEVER use a field named `type` -- it is `windowType`.
- Sliding glass DOORS (SXD/SSD/CSSM codes) are DOORS, not windows -- they belong to lock_up (exterior) or fixout (interior). Never list them here even if the legend calls them "sliding".
- "TILED REVEAL" or similar notes describe the reveal finish, not a new window.
- Evidence: window schedule, glazing legend, elevations, floor plans.
- Be exhaustive: cross-check the schedule against elevations -- schedule-only windows are often missed on plan.
