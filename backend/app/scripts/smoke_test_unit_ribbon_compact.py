from pathlib import Path
p=Path(__file__).resolve().parents[3]/'frontend_next/src/views/right-property-pane/WorkPackUnitSelector.jsx'
s=p.read_text(encoding='utf-8')
checks=[
 ('delete button still exists', '>×</button>' in s),
 ('compact select width', 'width: "84px"' in s),
 ('compact button width', 'width: "22px"' in s),
 ('compact button height', 'height: "24px"' in s),
 ('compact gap', 'gap: "3px"' in s),
 ('delete remains disabled for Unit 1', 'activeWorkPackUnit === "Unit 1"' in s),
]
for name, ok in checks:
 print(('[PASS] ' if ok else '[FAIL] ')+name)
if not all(ok for _,ok in checks): raise SystemExit(1)
print(f'Unit ribbon compact controls smoke test: PASS ({sum(ok for _,ok in checks)}/{len(checks)})')
