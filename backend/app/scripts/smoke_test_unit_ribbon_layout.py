from pathlib import Path
p = Path(__file__).resolve().parents[3] / 'frontend_next' / 'src' / 'views' / 'RibbonView.jsx'
s = p.read_text(encoding='utf-8')
checks = [
    ('ribbon stays single-line', 'flexWrap: "nowrap"' in s),
    ('ribbon groups do not shrink', '.cad-ribbon > .ribbon-group' in s and 'flex-shrink: 0 !important' in s),
    ('ribbon divider does not shrink', '.cad-ribbon > .ribbon-divider' in s),
    ('horizontal overflow does not resize controls', 'overflowX: "auto"' in s),
    ('scrollbar hidden', 'scrollbar-width: none' in s and '::-webkit-scrollbar' in s),
    ('navigation width remains compact', 'minWidth: "168px"' in s),
    ('unit control remains right aligned', 'marginLeft: "auto"' in s and 'justifyContent: "flex-end"' in s),
]
failed=[]
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    if not ok: failed.append(name)
if failed:
    raise SystemExit(f"Unit ribbon layout smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)})")
print(f"Unit ribbon layout smoke test: PASS ({len(checks)}/{len(checks)})")
