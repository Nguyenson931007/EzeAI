from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
service = (ROOT / "backend/services/document_ai_service.py").read_text(encoding="utf-8")
report = (ROOT / "frontend_next/src/components/DocumentAiReportModal.jsx").read_text(encoding="utf-8")

checks = [
    ("backend exposes status counts", '"status_counts": status_counts' in service),
    ("backend tracks all four task statuses", 'status_counts = {"CHANGE": 0, "KEEP": 0, "NO_EVIDENCE": 0, "UNRESOLVED": 0}' in service),
    ("omitted model tasks are unresolved not silently no-evidence", '"status": "UNRESOLVED"' in service and 'Model omitted this task result' in service),
    ("invalid missing task status does not default to change", 'status = "UNRESOLVED"' in service and 'Missing/invalid task status' in service),
    ("report displays four status groups", 'const STATUSES = ["CHANGE", "KEEP", "NO_EVIDENCE", "UNRESOLVED"]' in report),
    ("report shows reviewed coverage", 'GPT reviewed ${tasks.length}/${expectedTasks' in report),
    ("report shows direct model coverage", 'were returned directly by the model' in report),
    ("report labels tasks with friendly names", 'TASK_LABELS[task.task_key]' in report),
    ("report shows task summary", 'task?.summary' in report),
    ("report surfaces unresolved reasons", 'unresolved.map' in report),
    ("review button only appears when changes exist", 'statusTotals.CHANGE > 0' in report),
]

failed = []
for label, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}")
    if not ok:
        failed.append(label)
if failed:
    raise SystemExit(f"Document AI full report smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)})")
print(f"Document AI full report smoke test: PASS ({len(checks)}/{len(checks)})")
