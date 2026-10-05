## insulation -- wall, ceiling and floor insulation

Two different row kinds -- do not mix them:

1. WALL rows: one row per wall TYPE (not per wall instance), grouped by (floorLevel, type, height).
   - `type`: "Ext wall" (external walls -- included by default), "Partywall" (party/parapet walls), "Int wall" (interior -- only when the user explicitly includes them; do not propose unprompted).
2. AREA rows (`type` = "Ceiling" / "Floor", `areaType` = "Ceiling" / "Floor"): area-based insulation, e.g. ceiling batts.

- `rValue` and `product`/`productName`: THE core AI value-add -- the app leaves these EMPTY by default. Read them from the energy assessment (NatHERS) report.
- CRITICAL: plans often say "PROVIDE INSULATION AS NOTED IN ENERGY ASSESSMENT REPORT" -- that report is usually an EXTERNAL document, not in the PDF. If the R-values are not in the selected pages, return UNRESOLVED -- never invent R-values.
- NEVER propose `height`, `length`, `netArea`, `insulationArea` -- canvas geometry / calculated.
- `floorLevel`: which storey.
- Common miss: garage ceiling insulation (when a bedroom sits over the garage) and partywall acoustic batts -- check the energy report, not just the plan.
