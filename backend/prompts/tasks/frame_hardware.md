## frame_hardware -- timber wall frames

Wall framing schedule. In the app, rows group walls by (floorLevel, baseType, wallClass, height) -- one row per unique build-up, NOT per wall instance. Only EXTERIOR and LOAD-BEARING walls are included; plain interior partitions are excluded.

- `wallClass`: "exterior_wall" for external walls, "interior_wall" for internal load-bearing walls.
- `baseType`: "Concrete Slab" or "Timber Floor" -- what the wall's bottom plate fixes to. Read from slab/footing notes ("SLAB DESIGN TO ENGINEERS DETAIL" ? Concrete Slab).
- `rodSize`: hold-down anchor rod diameter. App default is "M12" -- only propose "M16" when the engineering/tie-down notes explicitly call it out.
- `spacing`: stud spacing. App default is "900 mm" -- only propose otherwise when the framing spec states it (e.g. 450/600).
- `floorLevel`: which storey.
- NEVER propose `height` or `length` -- those come from canvas geometry.
- Evidence: roof/floor framing notes, engineering tie-down notes, wall type labels on plan (e.g. "AAC 450", "STUD"), section details. Full framing specs are often in the frame manufacturer's details (external document) -- do not invent.
