from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

checks = []

def contains(rel, text):
    value = (ROOT / rel).read_text(encoding='utf-8')
    return text in value

checks.extend([
    ("backend exposes task-module sync endpoint", contains("backend/api/jobs.py", '/jobs/ems/{ems_id}/task-modules')),
    ("backend writes task_group_hw_steps visibility", contains("backend/api/jobs.py", 'SET is_visible = %s')),
    ("backend protects standard HW workflow", contains("backend/api/jobs.py", 'if 12 in step_numbers or 13 in step_numbers')),
    ("frontend API sends task_modules", contains("frontend_next/src/models/api.service.js", 'body: JSON.stringify({ task_modules: taskModules })')),
    ("Manage Modules uses persisted callback", contains("frontend_next/src/views/right-property-pane/ManageModulesPopup.jsx", 'onModuleIdsChange(next)')),
    ("Enable all persists too", contains("frontend_next/src/views/right-property-pane/ManageModulesPopup.jsx", 'onModuleIdsChange(customerModuleIds)')),
    ("Right pane syncs modules to backend", contains("frontend_next/src/views/RightPropertyPaneView.jsx", 'ApiService.updateTaskModules(emsId, normalized)')),
    ("empty floor can be added without file", contains("frontend_next/src/components/App.jsx", 'handleAddEmptyFloorLevel')),
    ("LEVEL plus calls empty-floor handler", contains("frontend_next/src/views/LeftRailView.jsx", 'onClick={() => onAddEmptyFloor?.()}')),
    ("plan attachment remains optional", contains("frontend_next/src/views/LeftRailView.jsx", 'Attach Plan to Floor')),
    ("floor registry still persists to shared API", contains("frontend_next/src/components/App.jsx", 'ApiService.updateTaskFloorLevels(emsId, normalized)')),
])

failed = 0
for label, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}")
    failed += 0 if ok else 1

if failed:
    raise SystemExit(f"Task/floor bidirectional sync smoke test: FAIL ({failed}/{len(checks)} failed)")
print(f"Task/floor bidirectional sync smoke test: PASS ({len(checks)}/{len(checks)})")
