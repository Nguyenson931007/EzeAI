from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
checks = []
def ck(name, ok):
    checks.append((name, bool(ok)))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")

ribbon = (ROOT/'frontend_next/src/views/RibbonView.jsx').read_text(encoding='utf-8')
selector = (ROOT/'frontend_next/src/views/right-property-pane/WorkPackUnitSelector.jsx').read_text(encoding='utf-8')
route = (ROOT/'backend/api/work_pack_units.py').read_text(encoding='utf-8')

ck('page nav cannot shrink', 'flexShrink: 0, minWidth: "196px"' in ribbon)
ck('Level label is single-line', 'whiteSpace: "nowrap", minWidth: "52px"' in ribbon)
ck('Unit ribbon has enough width', 'minWidth: "235px"' in ribbon and 'flexShrink: 0' in ribbon)
ck('Unit selector is wider', 'width: "106px"' in selector)
ck('Unit selector has add button', 'title="Add Unit"' in selector)
ck('Unit selector has delete button', 'handleDelete' in selector and '>×</button>' in selector)
ck('delete is confirmed', 'showConfirm' in selector and 'Delete ${unit}?' in selector)
ck('Unit 1 cannot be deleted from UI', 'activeWorkPackUnit !== "Unit 1"' in selector)
ck('backend exposes shared Unit DELETE', '@router.delete("/{customer_id}/jobs/{job_id}/units/{unit}")' in route)
ck('backend protects Unit 1', 'Unit 1 is the default Unit and cannot be deleted.' in route)

if not all(v for _, v in checks):
    raise SystemExit(1)
print(f"Unit ribbon controls smoke test: PASS ({len(checks)}/{len(checks)})")
