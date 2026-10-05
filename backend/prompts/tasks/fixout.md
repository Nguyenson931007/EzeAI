## fixout -- INTERIOR doors only (second-fix carpentry)

Only doors INSIDE the dwelling: bedroom, bathroom, ensuite, WC, internal laundry, robe, linen, store, broom.

- NEVER include: front entry, patio/alfresco sliders (SXD/SSD), garage vehicle or pedestrian doors, external laundry doors, or any door on an external wall. Those are lock_up.
- Typical plan codes: 870 / 820 (door widths in mm), "CAVITY SLIDER", "C.S.D". A bare number like "870" on an interior wall opening IS a door -- propose it (category from context: hinged ? "prehung", sliding in wall ? "cavity").
- `door_label`: the ROOM the door serves (e.g. "Bed 1", "ENS", "WIR", "Linen") -- this is how the app identifies fixout rows, not a door code. Derive it from the room adjacent to the door opening.
- `category`: "prehung", "loose-jamb", "cavity", "sliding", "bifold" -- note there is NO "external" here.
- `door_frame`: "None", "Steel Frame", "Ezy Jamb".
- `wall_width`: "70" or "90" -- the wall the door sits in.
- `door_furniture`: handle set -- "Passage Set" for bedrooms/living/study, "Privacy Set" for bathroom/WC/ensuite, "Dummy Set" for store/broom, "CSD Passage/Privacy Set" for cavity sliders.
- `hung` (hole): "HF" for bathroom/WC/ensuite, "HO" for linen/robe, "None" for cavity sliders.
- `handing`: RH / LH / DBL DOOR SET... (prehung only; "None" for cavity sliders).
- `finish`: CHR / SCH / None (cavity sliders: "None"). `door_stop`: Cushion / DS2 with Riser / None (cavity: "None").
- `height` / `width`: supplied dropdowns; "spec" when the documented size is not listed.
- `qty`: count of identical doors. `floorLevel`: GF / FF.
- If the document does not clearly place a door inside the dwelling, prefer UNRESOLVED over guessing fixout.
- Evidence: floor plans (interior openings), door schedule, second-fix specification.
