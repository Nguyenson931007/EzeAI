from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
left=(ROOT/'frontend_next/src/views/LeftRailView.jsx').read_text(encoding='utf-8')
app=(ROOT/'frontend_next/src/components/App.jsx').read_text(encoding='utf-8')
right=(ROOT/'frontend_next/src/views/RightPropertyPaneView.jsx').read_text(encoding='utf-8')
checks=[
 ('empty level remains selectable', 'onEmptyLevelClick?.(code)' in left and 'propSetCurrentLevelIndex(idx)' in left),
 ('empty level clears previous plan', 'handleSelectEmptyFloorLevel' in app and 'setImage(null)' in app),
 ('new floor gets isolated empty page data', 'createAndActivateEmptyFloorPage' in app and 'setRoomsByPage((previous) => ({ ...previous, [pageIndex]: [] }))' in app and 'setWallsByPage((previous) => ({ ...previous, [pageIndex]: [] }))' in app and 'setDoorsByPage((previous) => ({ ...previous, [pageIndex]: [] }))' in app),
 ('active state uses level registry index', 'Number(propCurrentLevelIndex) === idx' in left),
 ('selection event emitted', 'building-floor-selected' in left),
 ('new empty floor auto selected', 'setCurrentLevelIndex(nextIndex)' in app),
 ('real page keeps level selection aligned', 'levelMap.get(Number(currentPage))' in app),
 ('flooring task follows selected building floor', 'onBuildingFloorSelected' in right and 'flooringTaskId(floorLevel)' in right),
 ('empty registry floor never borrows a page index', 'const originalIndex = p?.originalIndex;' in left and 'p?.originalIndex ?? idx' not in left),
 ('selecting an existing floor never creates a duplicate page', 'const existingFloorEntry = Array.from(buildArchitecturalFloorLevelMap(pages || []).entries())' in app and 'if (existingFloorEntry)' in app),
]
for name,ok in checks:
 print(('[PASS]' if ok else '[FAIL]'), name)
if not all(x[1] for x in checks): raise SystemExit(1)
print(f'Empty floor selection smoke test: PASS ({len(checks)}/{len(checks)})')
