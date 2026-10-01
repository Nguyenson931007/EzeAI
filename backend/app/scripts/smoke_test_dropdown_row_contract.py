from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
FE = ROOT / "frontend_next" / "src"

checks = []

def check(name, cond, detail=""):
    checks.append((name, bool(cond), detail))


def read(rel):
    p = ROOT / rel
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8", errors="replace")

# 1) Shared guard exists and exposes strict resolver API.
guard = read("frontend_next/src/utils/dropdownValueGuard.js")
check("shared dropdown guard exists", "resolveDropdownValue" in guard and "firstDropdownValue" in guard)
check("guard rejects arbitrary fallback by default", 'fallback = ""' in guard)

# 2) Bunnings customers share the same task components, so one task fix covers all.
for customer in ["bun-seqld", "bun-vic", "bun-sa", "bun-tas", "bunnings-qld"]:
    idx = read(f"frontend_next/src/components/{customer}/tasks/index.js")
    check(f"{customer} uses shared BUN task UI", '../../bun-nsw-act/tasks' in idx)

# 3) Dynamic auto-fill builders stage free text as candidates instead of committing it.
auto = read("frontend_next/src/utils/procurementAutoFill.js")
for token in ["door_type_candidate", "jamb_size_candidate", "product_candidate", "rValue_candidate"]:
    check(f"auto-fill stages {token}", token in auto)
check("shelving type resolves against dropdown", "resolveDropdownValue(typeCandidate, SHELVING_TYPES" in auto)
check("shelving size resolves against dropdown", "resolveDropdownValue(r?.shelf_size || r?.shelving_size, SHELVING_SIZES" in auto)

# 4) Major BUN row tasks enforce dropdown validation after any AI/GPT/cache restore.
major = {
    "Flooring": "frontend_next/src/components/bun-nsw-act/tasks/FlooringDeckingTask.jsx",
    "Hebel Flooring": "frontend_next/src/components/bun-nsw-act/tasks/HebelFlooringTask.jsx",
    "Lockup": "frontend_next/src/components/bun-nsw-act/tasks/LockupTask.jsx",
    "Fixout": "frontend_next/src/components/bun-nsw-act/tasks/FixoutTask.jsx",
    "Insulation": "frontend_next/src/components/bun-nsw-act/tasks/InsulationTask.jsx",
    "Timber Posts": "frontend_next/src/components/bun-nsw-act/tasks/TimberPostsTask.jsx",
    "Frame Hardware": "frontend_next/src/components/bun-nsw-act/tasks/FrameHardwareTask.jsx",
    "Shelving": "frontend_next/src/components/bun-nsw-act/tasks/ShelvingTask.jsx",
    "Power Truss": "frontend_next/src/components/bun-nsw-act/tasks/PowerTrussBracesTask.jsx",
    "Hardies Fire Walls": "frontend_next/src/components/bun-nsw-act/tasks/HardiesFireWallsTask.jsx",
}
for label, rel in major.items():
    src = read(rel)
    check(f"{label} imports/uses dropdown resolver", "resolveDropdownValue" in src)

# 5) Catalog-backed task dropdowns use active customer catalog rather than legacy hardcoded products.
floor = read("frontend_next/src/components/bun-nsw-act/tasks/FlooringDeckingTask.jsx")
area = read("frontend_next/src/components/AreaSummaryJobsModal.jsx")
check("Flooring product options come from customer catalog", "useCatalog(activeCustomerShortName" in floor and "catalogByArea" in floor)
check("AreaSummary product dropdown comes from customer catalog", "useCatalog(activeCustomerShortName" in area and "productOptionsForType" in area)
check("AreaSummary does not inject legacy product as extra option", "!opts.includes(currentProd)" not in area)

# 6) No known legacy generated product strings remain in frontend source.
legacy = [
    "HARDWOOD DECKING 90X19MM MERBAU",
    "HEBEL POWERFLOOR PANEL 1800X600X75MM",
    "FLOORING ADHESIVE 600ML SAUSAGE",
    "0810608 - INS BATT R2.0 430MM",
    "0810620 - INS CEILING BATT R4.0 430MM",
]
all_frontend = "\n".join(
    p.read_text(encoding="utf-8", errors="replace")
    for p in FE.rglob("*.jsx")
)
for value in legacy:
    check(f"legacy generated value removed: {value}", value not in all_frontend)

# 7) No fabricated fallback rows for Frame Hardware when no verified drawing rows.
frame = read("frontend_next/src/components/bun-nsw-act/tasks/FrameHardwareTask.jsx")
check("Frame Hardware does not fabricate 138922mm fallback", "138922" not in frame)
check("Frame Hardware empty drawing produces no invented rows", "No verified drawing rows" in frame and "generatedEntries = [];" in frame)

# 8) Cairns separate components also share dropdown arrays with generated output.
cairns_floor = read("frontend_next/src/components/cairns-hardware/tasks/FlooringDeckingTask.jsx")
check("Cairns Flooring generator returns dropdown constants", "return CAIRNS_FLOOR_TYPE_OPTIONS[" in cairns_floor)
check("Cairns Flooring form renders same type option array", "CAIRNS_FLOOR_TYPE_OPTIONS.map" in cairns_floor)
check("Cairns Flooring no fabricated default area", "22.5" not in cairns_floor)

cairns_ins = read("frontend_next/src/components/cairns-hardware/tasks/InsulationTask.jsx")
check("Cairns Insulation requires catalog product", "wallProductOptions.includes(insWallProduct)" in cairns_ins and "areaProductOptions.includes(insAreaProduct)" in cairns_ins)
check("Cairns Insulation no hardcoded product-code fallback", '|| "0810608"' not in cairns_ins and '|| "0810620"' not in cairns_ins)

# 9) Right pane global generators don't seed old manual product defaults.
rp = read("frontend_next/src/views/RightPropertyPaneView.jsx")
for bad in ["0810608 - INS BATT R2.0 430MM", "0810620 - INS CEILING BATT R4.0 430MM", 'flooring_type: "Hybrid / Vinyl Plank"', "areaNum = 14.5"]:
    check(f"RightPropertyPane does not seed {bad}", bad not in rp)
check("RightPropertyPane Flooring stages product candidate", "product_candidate: r.product || \"\"" in rp)
check("RightPropertyPane Lockup uses shared builder", "buildLockupRows(sourceList, [])" in rp)

failed = [x for x in checks if not x[1]]
for name, ok, detail in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

print(f"\nDropdown row contract smoke test: {'PASS' if not failed else 'FAIL'} ({len(checks)-len(failed)}/{len(checks)})")
if failed:
    sys.exit(1)
