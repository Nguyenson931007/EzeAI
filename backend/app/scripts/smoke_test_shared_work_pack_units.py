from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
checks = []
def ck(name, ok):
    checks.append((name, bool(ok))); print(f"[{'PASS' if ok else 'FAIL'}] {name}")
route=(ROOT/'backend/api/work_pack_units.py').read_text(encoding='utf-8')
main=(ROOT/'backend/main.py').read_text(encoding='utf-8')
ctx=(ROOT/'frontend_next/src/models/app.context.jsx').read_text(encoding='utf-8')
api=(ROOT/'frontend_next/src/models/api.service.js').read_text(encoding='utf-8')
ribbon=(ROOT/'frontend_next/src/views/RibbonView.jsx').read_text(encoding='utf-8')
ck('shared registry uses Procurement WorkPackInput', '[ProcurementApp].[dbo].[WorkPackInput]' in route)
ck('Unit 1 is the backward-compatible default', 'DEFAULT_UNIT = "Unit 1"' in route)
ck('add Unit is explicit POST action', '@router.post' in route and 'REGISTRY_SHEET_ID' in route)
ck('backend router is registered', 'work_pack_units_router' in main)
ck('active Unit is shared through AppContext', 'activeWorkPackUnit' in ctx and 'setActiveWorkPackUnit' in ctx)
ck('all normal API headers carry active Unit', 'X-Work-Pack-Unit' in api)
ck('frontend can read shared Units', 'getWorkPackUnits' in api)
ck('frontend can create shared Unit', 'addWorkPackUnit' in api)
ck('top title bar renders Unit selector', 'Shared Unit with Procurement' in ribbon and '<select' in ribbon)
ck('Unit list polls for Procurement changes', 'setInterval(loadUnits, 6000)' in ribbon)
ck('Unit change emits an app-wide event', 'work-pack-unit-changed' in ctx)
if not all(v for _,v in checks): raise SystemExit(1)
print(f"Shared Work Pack Unit smoke test: PASS ({len(checks)}/{len(checks)})")
