## hardies_fire_walls -- fire-rated boundary / intertenancy walls

James Hardie fire-rated wall systems for boundary (zero-lot-line) and intertenancy walls -- NCC fire separation. Only for projects with boundary or intertenancy walls; most standard detached homes have NONE -- return NO_EVIDENCE in that case, do not force rows.

- `location`: where the fire wall is (e.g. "Garage boundary wall", "East boundary", "Between Unit 1/2").
- `systemType`: from supplied options -- match the FRL on the fire separation plan (e.g. "HardieSmart(TM) Boundary Wall System (FRL 60/60/60)", "HardieFire(TM) Intertenancy Wall (FRL 90/90/90)").
- `liningSpec`: lining build-up from supplied options.
- `framing`: stud size/spacing from supplied options (e.g. "90mm Timber Studs @ 450mm crs").
- `sealant` / `angle`: fire sealant and angle from supplied options.
- Ordinary (non-fire-rated) walls do NOT belong here -- even if they are boundary walls without a fire rating note.
- Evidence: fire separation / BCA compliance plan, NCC notes, elevations noting boundary construction.
