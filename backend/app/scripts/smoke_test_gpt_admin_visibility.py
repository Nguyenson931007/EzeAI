from pathlib import Path

root = Path(__file__).resolve().parents[3]
view = (root / 'frontend_next/src/views/RightPropertyPaneView.jsx').read_text(encoding='utf-8')
tabs = (root / 'frontend_next/src/views/right-property-pane/RightPropertyTabBar.jsx').read_text(encoding='utf-8')

checks = {
    'admin permission uses shared isFullAdmin': 'const isGptAdmin = isFullAdmin(user);' in view,
    'tab receives admin feature flag': 'showGptFeature={isGptAdmin}' in view,
    'open handler is admin guarded': 'if (isGptAdmin) setShowDocumentAi(true);' in view,
    'review/report modals are admin guarded': '{isGptAdmin && (' in view and '<DocumentAiReviewModal' in view and '<DocumentAiReportModal' in view,
    'GPT tab is hidden by default': 'showGptFeature = false' in tabs,
    'GPT button is conditionally rendered': '{showGptFeature && (' in tabs and 'title="GPT Document Review"' in tabs,
}

failed = []
for name, ok in checks.items():
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    if not ok:
        failed.append(name)

if failed:
    raise SystemExit(f"GPT admin visibility smoke test: FAIL ({len(failed)} failed)")
print(f"\nGPT admin visibility smoke test: PASS ({len(checks)}/{len(checks)})")
