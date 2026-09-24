# Refactor notes

## Completed in this pass

### Repository cleanup

The root directory contained implementation snapshots, sample documents, prototypes, a duplicate backend route, and a runtime log. These were separated from executable source:

- Detached `*Form.tsx` snapshots moved to `docs/reference/forms/`.
- Sample PDF/XLSX files moved to `docs/reference/assets/`.
- Standalone HTML prototype moved to `docs/reference/prototypes/`.
- Duplicate `framework_routes 3.py` moved to `docs/reference/legacy-backend/framework_routes.legacy.py`.
- Handoff material moved to `docs/reference/handoff/`.
- Catalog example package moved to `docs/reference/catalog-example/`.
- `ezefloor_backend.log` removed (runtime-generated log; logs are already ignored by `.gitignore`).

No runtime import referred to the moved root snapshots before they were moved.

### BOQTable decomposition

`frontend_next/src/components/BOQTable.jsx` mixed the primary BOQ component with two large, self-contained schedule views. Those views were extracted without changing their business logic:

- `frontend_next/src/components/boq/LockUpScheduleExcelView.jsx`
- `frontend_next/src/components/boq/FixOutScheduleView.jsx`

`BOQTable.jsx` dropped from roughly 4,577 lines to roughly 2,892 lines.

## Large files still worth splitting

The next high-value candidates are:

- `frontend_next/src/views/CanvasView.jsx` (~7.5k lines): split canvas layers by domain (`walls`, `doors`, `rooms`, `ocr`, `roi`) and move shared geometry helpers out.
- `frontend_next/src/controllers/interaction.controller.js` (~5.7k lines): split interaction modes/commands and snapping/edit operations.
- `backend/services/floor_ai_detect.py` (~5k lines): separate model loading, preprocessing, inference, post-processing, and orchestration.
- `frontend_next/src/views/canvas/AnnotationCanvasLayer.jsx` (~4.8k lines): split render layers and editing handlers.
- `frontend_next/src/views/RightPropertyPaneView.jsx` (~4.6k lines): convert panel selection/configuration to a registry.
- `frontend_next/src/app/globals.css` (~3.5k lines): break into domain styles or component-local styles.

These are intentionally left behaviorally unchanged in this pass because they are tightly coupled and should be split with targeted regression tests rather than by moving blocks blindly.

## Refactor rule

Keep runtime modules out of the repository root. New feature code should go into an existing domain folder or a new domain-specific folder. Put non-runtime snapshots and implementation references under `docs/reference/` rather than next to executable code.


## Strong cleanup pass

- Moved the standalone annotation app to `tools/door-annotation-tool/`.
- Moved development/database/training utilities to `tools/scripts/`.
- Moved the wall-prior training dataset to `datasets/wall_prior/` and updated its training defaults/references.
- Added `tools/cleanup-legacy-root.ps1` to remove legacy root snapshots/logs/prototypes left behind by copy-over installs.
- The intended repository root now contains only application domains and repository-level metadata.
