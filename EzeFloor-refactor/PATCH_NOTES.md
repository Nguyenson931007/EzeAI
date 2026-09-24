# Task UI consistency + Lockup inline editing

Compared with the uploaded ProcurementApp source.

Changes:
- Removes duplicated LEFT-side collapse arrows from task section headers.
- Keeps a single ▲/▼ control on the RIGHT.
- Standardizes section-title typography to 12px / 16px / 800.
- Lockup popup editor is completely removed.
- Lockup now edits directly inside the Entered doors table:
  - double-click a row -> edit that row inline
  - Enter -> save
  - click/focus outside the edited row -> save
  - Escape -> cancel
- Single click only selects/highlights the row; it does not open editing.
- Edit pencil is removed; delete remains.
- Canvas selection highlights a row but no longer forces an editor popup.

The inline fields mirror Procurement's row-edit pattern:
category, location, door type, size, thickness, jamb/wall, jamb size,
hung, type, weather guard, double rebated, HF/HO, color, stop and qty.

No database schema or automatic DB write/delete changes.
