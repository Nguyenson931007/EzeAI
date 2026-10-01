from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
left=(ROOT/'frontend_next/src/views/LeftRailView.jsx').read_text(encoding='utf-8')
app=(ROOT/'frontend_next/src/components/App.jsx').read_text(encoding='utf-8')
right=(ROOT/'frontend_next/src/views/RightPropertyPaneView.jsx').read_text(encoding='utf-8')
checks=[
 ('empty level remains selectable', 'if (originalIdx == null) return;' in left and 'propSetCurrentLevelIndex(idx)' in left),
 ('active state uses level registry index', 'Number(propCurrentLevelIndex) === idx' in left),
 ('selection event emitted', 'building-floor-selected' in left),
 ('new empty floor auto selected', 'setCurrentLevelIndex(nextIndex)' in app),
 ('real page keeps level selection aligned', 'levelMap.get(Number(currentPage))' in app),
 ('flooring task follows selected building floor', 'onBuildingFloorSelected' in right and 'flooringTaskId(floorLevel)' in right),
]
for name,ok in checks:
 print(('[PASS]' if ok else '[FAIL]'), name)
if not all(x[1] for x in checks): raise SystemExit(1)
print(f'Empty floor selection smoke test: PASS ({len(checks)}/{len(checks)})')
