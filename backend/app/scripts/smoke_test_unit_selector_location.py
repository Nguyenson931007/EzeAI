from pathlib import Path
root = Path(__file__).resolve().parents[3]
ribbon = (root/'frontend_next/src/views/RibbonView.jsx').read_text(encoding='utf-8')
tree = (root/'frontend_next/src/views/right-property-pane/TreeExplorerPanel.jsx').read_text(encoding='utf-8')
selector = (root/'frontend_next/src/views/right-property-pane/WorkPackUnitSelector.jsx').read_text(encoding='utf-8')
checks = [
    ('top ribbon no longer renders Unit selector', 'Shared Unit with Procurement' not in ribbon),
    ('property tree renders Unit selector', '<WorkPackUnitSelector currentProjectName={currentProjectName} />' in tree),
    ('selector reads shared Unit API', 'ApiService.getWorkPackUnits' in selector),
    ('selector creates shared Unit', 'ApiService.addWorkPackUnit' in selector),
    ('selector uses shared app Unit state', 'activeWorkPackUnit' in selector and 'setActiveWorkPackUnit' in selector),
]
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
if not all(ok for _, ok in checks): raise SystemExit(1)
print(f"Unit selector location smoke test: PASS ({len(checks)}/{len(checks)})")
