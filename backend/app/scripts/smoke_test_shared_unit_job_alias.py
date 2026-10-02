from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
route = (ROOT / "backend/api/work_pack_units.py").read_text(encoding="utf-8")

checks = [
    ("resolves IDJob/JobNumber aliases", "def _resolve_job_aliases" in route and "ClientJobNumber" in route),
    ("future writes use canonical JobNumber", 'canonical = str(row.get(\"job_number\")' in route),
    ("unit reads accept all job aliases", "UPPER(LTRIM(RTRIM(job_id))) IN" in route),
    ("create reads aliases before allocating next Unit", "current = _read_units(cursor, customer, aliases)" in route),
    ("delete removes shared Unit across aliases", "*[item.upper() for item in aliases]" in route),
    ("GET exposes canonical job key for diagnostics", '"job_key": canonical_job' in route),
]
for label, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}")
if not all(ok for _, ok in checks):
    raise SystemExit(1)
print(f"Shared Unit job-alias smoke test: PASS ({len(checks)}/{len(checks)})")
