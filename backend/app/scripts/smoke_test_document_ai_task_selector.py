from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODAL = ROOT / "frontend_next" / "src" / "components" / "DocumentAiReviewModal.jsx"
text = MODAL.read_text(encoding="utf-8")

checks = [
    ("task selector state exists", "const [selectedTasks, setSelectedTasks] = useState(new Set())" in text),
    ("all task keys come from live task context", "Object.keys(taskContext || {})" in text),
    ("all tasks are selected by default", "setSelectedTasks(new Set(taskKeys))" in text),
    ("all tasks toggle exists", "const toggleAllTasks" in text and '"All Tasks"' in text),
    ("individual task toggle exists", "const toggleTask" in text),
    ("only selected tasks are sent to GPT", "selectedTaskContext" in text and "filter(([taskKey]) => selectedTasks.has(taskKey))" in text),
    ("empty task selection blocks GPT run", "selectedTasks.size === 0" in text),
    ("task count is visible", "task(s)" in text and "selectedTasks.size" in text),
    ("known task labels are user friendly", 'flooring_decking: "Flooring & Decking"' in text and 'eaves_soffit: "Eaves & Soffit"' in text),
]

failed = 0
for label, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}")
    failed += 0 if ok else 1

if failed:
    raise SystemExit(f"Document AI task selector smoke test: FAIL ({failed}/{len(checks)} failed)")
print(f"Document AI task selector smoke test: PASS ({len(checks)}/{len(checks)})")
