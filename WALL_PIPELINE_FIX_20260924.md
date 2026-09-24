# Wall pipeline fix — 2026-09-24

Changes in `backend/services/wall_segment_service.py`:

- Raster-aware duplicate collapse for near-parallel duplicate centerlines.
- Preserve genuine parallel walls unless the midpoint is supported as one shared wall band.
- Recovery pass deduplicates against candidates already recovered in the same pass.
- Orphan-fragment cleanup removes very short isolated unsupported false positives more reliably while keeping connected/long walls fail-open.
- Fixed raw-wall coverage coordinates in `_restore_supported_raw_walls` so post-processing cannot falsely claim a missing raw wall is represented.
- Final polygon NMS now requires near-parallel centerlines; perpendicular T/X junction walls are never deleted just because polygons overlap.
- Both `predict()` and `predict_stream()` derive final polygon/render geometry from `centerline + thickness` via `_rebuild_wall_geometry`.
- Existing envelope flood-fill classification remains the final source for exterior/interior classification.
- Existing thickness-aware, raster-supported T-gap bridge remains in place.

Regression tests: `backend/tests/test_wall_postprocessing.py` — 13 passed in the patch environment (Ultralytics import stubbed because that package is not installed in the sandbox).

## Follow-up: duplicate / drift fix from garage screenshots
- Removed the old 18px hard ceiling before shared-band duplicate checks. Thick walls now use a thickness-aware candidate window up to 38px, but still require raster proof at the shared midpoint before collapsing.
- Added `_align_collinear_wall_chain_axes()` to straighten adjacent pieces of the same wall lane when they drift a few pixels after split/recovery. It is endpoint-local and raster-gated; it does not merge or extend walls.
- Strengthened decisive false-positive removal for synthetic `visual_recovery` runs with almost zero wall-band evidence, while raw YOLO walls remain conservative/fail-open.
- Replaced final polygon-overlap NMS deletion with a strict near-identical-centerline gate. Large render polygons can no longer erase a separate close parallel wall merely due to containment.
- Regression suite now includes thick (>18px spacing) edge-pair duplicate and wall-chain lane drift cases.
