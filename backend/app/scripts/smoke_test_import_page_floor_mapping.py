from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "frontend_next" / "src" / "components" / "App.jsx"
text = APP.read_text(encoding="utf-8")

checks = []
def check(name, cond):
    checks.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}")

check("fresh level import maps by selected position", "nextImportFloorCode = (selectedPosition)" in text and "floorCodeFromNumber(selectedPosition)" in text)
check("first selected page maps to GF by zero-based position", "selectedData = uniqueSelectedPages.map((idx, selectedPosition)" in text)
check("append mode still fills empty registered floors first", "missingRegistered = registryFloors.find" in text)
check("imported page persists levelCode alias", "levelCode," in text)
check("imported page persists floorCode alias", "floorCode: levelCode" in text)
check("shared registry still merges imported floor codes", "syncBuildingFloorLevels([...(buildingFloorLevels || []), ...selectedFloorCodes])" in text)

# Contract examples requested by the user.
def floor_code(n):
    return {0: "GF", 1: "FF", 2: "SF"}.get(n, f"{n}F")

job3 = ["GF", "FF", "SF"]
selected2 = [floor_code(i) for i in range(2)]
selected4 = [floor_code(i) for i in range(4)]
merged4 = sorted(set(job3 + selected4), key=lambda x: {"GF":0,"FF":1,"SF":2}.get(x, int(x[:-1]) if x[:-1].isdigit() else 99))
check("2 selected pages fill GF and FF while SF remains empty", selected2 == ["GF", "FF"] and job3[2] == "SF")
check("4 selected pages expand a 3-floor job to a fourth floor", selected4 == ["GF", "FF", "SF", "3F"] and merged4 == ["GF", "FF", "SF", "3F"])

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit(f"Import page/floor mapping smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)}) -> {failed}")
print(f"Import page/floor mapping smoke test: PASS ({len(checks)}/{len(checks)})")
