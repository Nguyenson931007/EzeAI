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
