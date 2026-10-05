## cladding -- external wall cladding

External cladding only -- one row per distinct cladding material/zone. Read the ELEVATIONS, not the floor plan.

- `label`: elevation or wall zone identifier (e.g. "Front Elevation", "Side - Garage", "Upper North").
- `claddingType` + `product`: from supplied options. Match what the elevations actually call out -- e.g. "75mm AAC CLADDING", "JAMES HARDIE 300mm 'OBLIQUE' CLADDING", "FINE TEXTURE CLADDING". Map the documented wording to the nearest supplied option; if none matches uniquely ? UNRESOLVED.
- `waste`: waste percentage from the spec (document spec -- you MAY propose this).
- `floorLevel`: which storey.
- NEVER propose `height`, `length`, `openings`, `totalArea` -- canvas geometry / calculated. Note: the app computes area as heightxlength WITHOUT deducting openings -- do not try to net them out yourself.
- Cladding MATERIALS (product code, description, qty, unit) live on a separate "Cladding materials" card -- propose them only when the spec lists explicit product codes.
- "PROVIDE METAL FLASHING TO TOP OF AAC" and similar notes are flashings, not cladding -- do not create rows for them.
- Interior linings are NOT cladding.
- Be exhaustive: check ALL elevations (front, rear, both sides). Rear and side elevations are commonly missed. Garage walls often carry the same cladding as the house -- include them.
