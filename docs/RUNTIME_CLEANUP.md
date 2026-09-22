# Runtime cleanup

This package is the lean runtime-oriented source tree.

Removed because they are not part of application runtime:
- Python `__pycache__`, `.pyc`, `.pyo` files.
- `docs/reference/` historical snapshots, sample assets and prototypes.
- `datasets/wall_prior/` training dataset (training/inference source code remains).
- standalone `tools/door-annotation-tool/` and `tools/scripts/train_yolo.py`.
- `tests/benchmark/` image fixtures and generated `tests/outputs/`.
- `backend/scripts/debug/` one-off/debug utilities.
- duplicate `backend/data/selector_variants.json`; runtime uses `backend/app/customer_modules/bun_nsw_act/selector_variants.json`.
- unused Next starter SVGs, old login mockups, test logo and static PDF text-layer fixtures.

Kept intentionally although relatively large:
- `frontend_next/public/pdf.worker.min.mjs`: explicitly configured by `document.controller.js`.
- `frontend_next/public/wasm/*`: PDF.js codec/sandbox runtime support.
- `backend/roof_kernel/ezefloor_roof_v3.exe`: explicitly resolved by `backend/services/roof_v3/router.py`.
- `backend/app/customer_modules/bun_nsw_act/selector_variants.json`: loaded by selector catalog runtime code.
- `frontend_next/public/login-hero-bg.png`: referenced by application CSS.
