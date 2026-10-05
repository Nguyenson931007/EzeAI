## flooring_decking -- floor finishes by room

Floor finish per room/area. Match `location` to the supplied room list exactly -- never invent room names.

- `typeArea` (ONLY supplied values). The app auto-classifies rooms, but confirm/override from the floor finish plan:
  - "Dry" -- bedrooms, living, dining, study, hallways, WIR, store (default)
  - "Wet" -- bathroom, ensuite, WC, laundry (tiled wet zones)
  - "Balcony Tiles" -- patio, porch, balcony, verandah, alfresco
  - "Decking Input" -- external timber deck zones
  - "T+G Flooring Area" -- tongue-and-groove timber flooring zones (only when specified)
  - "Tile Underlay", "Battens Over Slab Area", "Floor Joist Packers" -- build-up components, only when the spec calls them out
- `product`: flooring product from the supplied catalog options. The app leaves this EMPTY by default -- your main value-add is matching the spec's floor finish to the catalog.
- `floorLevel`: GF / FF.
- NEVER propose `areaM2` or `totalM2` -- areas come from canvas geometry.
- Special notes: garage floors are often epoxy ("Epoxy Finish") -- not a standard flooring product; record as UNRESOLVED rather than forcing a match.
- Evidence: floor finish plan / legend, area schedule, specification document.
- Be exhaustive: every room on the plan needs a row. Wet rooms and patio/porch are the most commonly missed.
