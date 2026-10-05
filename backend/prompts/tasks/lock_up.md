## lock_up -- EXTERNAL doors only (lock-up stage). BE EXHAUSTIVE.

Every door on the building envelope belongs here:
- Front entry / main entrance doors (`category`: "external").
- Rear and side external doors.
- Sliding/stacker glass doors to patio, alfresco, verandah, deck or outside -- resolve codes through the plan's GLAZING NOTES legend (SXD=sliding glass door, SSD=sliding stacker glass door, CSSD=corner stacker). (`category`: "sliding" or "bifold").
- GARAGE doors: vehicle doors (roller, panel-lift, sectional) AND pedestrian/access doors between garage and house. Check the garage plan, elevations, and door schedule -- garage doors are the most commonly missed items. A note like "GPO for automatic door opener" proves a motorised vehicle door exists: record it as UNRESOLVED if no code is printed.
- External laundry doors (revision notes like "EXTERNAL LAUNDRY DOOR CHANGED" count as evidence ? UNRESOLVED when no code).

Codes NOT in the legend (e.g. VSD, MSD): still real doors. Read size pattern (21.18 (2P) = 2100H x 1800W, 2-panel) + nearby room labels, propose as UNRESOLVED with your best reading -- never drop silently.

Field semantics (from app code):
- `label` / `name`: door code from plan/schedule (e.g. SXD2424).
- `category`: "external", "prehung", "loose-jamb", "cavity", "sliding", "bifold" -- ONLY supplied values.
- `height` / `width`: supplied dropdowns; "Spec" when the documented size is not listed.
- `handing`: swing direction. EXTERNAL doors: Hung A / Hung B / Hung CG / Hung DG / Hung G / Pivot Door / Double Door Set / RH Pre Hung. INTERNAL doors: RH / LH / RH LO / LH LO / DBL DOOR SET / SET of THREE... -- use the right set for the door's scope.
- `internal_type`: handle-hole prep code -- HF (factory pre-drilled) / HO (drilled on site).
- `thickness`: 40mm typical external / 35mm internal / 38mm loose-jamb.
- `weatherguard` / `dbl_rebated`: Yes/No -- external doors only.
- `internal_type`: handle-hole type -- HF / HO.
- `finish` / `color`: CHR / SCH. `door_stop`: Cushion / DS2 with Riser.
- `jamb_or_wall`: wall thickness the door sits in (e.g. "90mm Wall"). `jamb_size`: jamb size if specified.
- `qty`: count of identical doors. `floorLevel`: GF / FF.
- Interior room doors (bedroom/bathroom/robe/linen) are NEVER lock_up -- they belong to fixout.
- Sliding glass doors are DOORS, not windows -- never send them to windows.
- Scan floor plans, elevations, sections, door schedules, glazing notes, revision notes. Do not stop after 2-3 doors.
