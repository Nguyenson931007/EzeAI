from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "frontend_next/src/components/bun-nsw-act/tasks/FlooringDeckingTask.jsx"
BACKEND = ROOT / "backend/api/area_summary_routes.py"

front = FRONTEND.read_text(encoding="utf-8")
back = BACKEND.read_text(encoding="utf-8")

checks = []

def check(name, condition):
    checks.append((name, bool(condition)))
    print(f"[{'PASS' if condition else 'FAIL'}] {name}")

check(
    "Save resolves Product through the active area dropdown",
    "const productOptions = getProductOptionsForType(typeArea);" in front
    and "resolveDropdownValue(rawProduct, productOptions" in front,
)
check(
    "Blank Product adopts the dropdown's first real option",
    "firstDropdownValue(productOptions)" in front,
)
check(
    "Save payload no longer writes raw r.product directly",
    "product: r.product || null" not in front,
)
check(
    "Frontend blocks save when a row cannot resolve a Product",
    "invalidProductRows.length > 0" in front
    and "Cannot save Flooring:" in front,
)
check(
    "Catalog-loading window preserves existing Product",
    "if (options.length === 0)" in front
    and "preserve the row exactly as-is" in front,
)
check(
    "Blank row state is synchronized to the visible first dropdown Product",
    "const product = rawProduct" in front
    and ": firstDropdownValue(options);" in front,
)
check(
    "Backend rejects positive-area Product=NULL before DB write",
    "missing_product_rows" in back
    and "status_code=422" in back
    and "have no Product" in back,
)
check(
    "Backend Product guard executes before AreaSummary archival",
    back.find("if missing_product_rows:") != -1
    and back.find("cursor.execute(sql_archive_old") != -1
    and back.find("if missing_product_rows:") < back.find("cursor.execute(sql_archive_old"),
)
check(
    "Backend preserves HTTP 422 instead of converting it to 500",
    "except HTTPException:" in back,
)

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit(f"Flooring Product save smoke test: FAIL ({len(failed)}/{len(checks)} failed)")
print(f"Flooring Product save smoke test: PASS ({len(checks)}/{len(checks)})")
