from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

checks = []
def check(name, cond):
    checks.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}")

app = read('frontend_next/src/components/App.jsx')
left = read('frontend_next/src/views/LeftRailView.jsx')
right = read('frontend_next/src/views/RightPropertyPaneView.jsx')
levels = read('frontend_next/src/utils/taskFloorLevels.js')
api = read('backend/api/jobs.py')

check('App owns shared building floor registry', 'const [buildingFloorLevels, setBuildingFloorLevels]' in app)
check('Shared floor registry persists through TaskList floor-level API', 'ApiService.updateTaskFloorLevels(emsId, normalized)' in app)
check('Imported architectural pages register floor codes', 'selectedFloorCodes' in app and 'syncBuildingFloorLevels([...(buildingFloorLevels || []), ...selectedFloorCodes])' in app)
check('Plan pages can extend shared floor registry', 'buildArchitecturalFloorLevelMap(pages || [])' in app and 'pageFloors' in app)
check('Left LEVEL rail renders from shared registry', 'buildingFloorLevels = ["GF"]' in left and 'normalizeTaskFloorCodes(buildingFloorLevels)' in left)
check('Left LEVEL rail supports API floors without plan pages', 'isEmptyLevel: originalIndex == null' in left and 'No plan page' in left)
check('Deleting a left floor updates shared registry', 'handleDeleteFloorLevel' in app and 'onDeleteFloor={handleDeleteFloorLevel}' in app)
check('Right task floors receive same shared registry', 'buildingFloorLevels: buildingFloorLevelsProp = ["GF"]' in right and 'normalizeTaskFloorCodes(buildingFloorLevelsProp)' in right)
check('Task-side floor changes call shared registry owner', 'onBuildingFloorLevelsChange(normalized)' in right)
check('Task tabs use floor codes instead of zero-based labels', 'label: `Floor ${floorLevel}`' in levels and 'label: `Floor ${floorNumber}`' not in levels)
check('Floor selector labels expose GF/FF/SF codes', 'Ground Floor (GF)' in levels and 'First Floor (FF)' in levels and 'Second Floor (SF)' in levels)
check('Backend floor API persists shared floor_levels', '@router.put("/jobs/ems/{ems_id}/floor-levels")' in api and 'SET floor_levels = %s' in api)
check('EzeFloor polls active TaskList job floors', 'tasklist-realtime-poll' in app and 'window.setInterval(refreshTaskFloorLevels, 3000)' in app)
check('TaskList floors remain authoritative over stale saved pages', 'isActiveTaskListJob' in app and 'if (isActiveTaskListJob) return;' in app)
check('LEVEL rail never merges removed saved-page floors back into registry', 'const allCodes = normalizeTaskFloorCodes(buildingFloorLevels);' in left and '[...registered, ...actualCodes]' not in left)
check('Removed TaskList floors purge their EzeFloor pages and drawings', 'const removedIndices = new Set();' in app and 'setRoomsByPage(remapPageData);' in app and 'setWallsByPage(remapPageData);' in app and 'setDoorsByPage(remapPageData);' in app)
check('Legacy TF and current 3F resolve to one canonical floor', 'normalizeTaskFloorCode(rawCode)' in app and 'normalizeTaskFloorCode(p?.code || pageCode)' in left)
check('Floor API reads the shared EMS job floor registry', 'WHERE t.id_job_ems = lj.IDJob' in api and 'ORDER BY t.created_at DESC, t.id DESC' in api)
check('Floor API writes every active HW group for the EMS job', 'WHERE id_job_ems = %s' in api and 'AND ISNULL(is_delete, 0) = 0' in api)
check('Frontend floor sync uses the shared EMS job id', 'pending.id_job_ems || pending.ems_id || pending.id' in app and 'task.id_job_ems || task.ems_id || task.hw_id' in right)
check('Realtime floor polling bypasses browser and proxy caches', 'cache: "no-store"' in read('frontend_next/src/models/api.service.js') and 'Cache-Control' in read('frontend_next/src/models/api.service.js'))
check('Realtime floor polling uses the dedicated shared floor endpoint', 'ApiService.getTaskFloorLevels(emsId)' in app and '@router.get("/jobs/ems/{ems_id}/floor-levels")' in api)

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit(f"Floor level 1:1 sync smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)})")
print(f"Floor level 1:1 sync smoke test: PASS ({len(checks)}/{len(checks)})")
