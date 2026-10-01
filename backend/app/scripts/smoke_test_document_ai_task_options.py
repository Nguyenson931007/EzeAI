from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.document_ai_task_options import get_task_options, resolve_option_value
from services.document_ai_task_schema import compact_task_schema


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    print(f"[PASS] {label}")


def options(task, customer="BUN-NSW-ACT"):
    schema = compact_task_schema(task, customer)
    # DB may be unavailable in a smoke test; static/customer contract must still bind.
    return get_task_options(task, customer, schema, {"rows": [], "form": {}})


def main():
    lock_nsw = options("lock_up", "BUN-NSW-ACT")
    lock_vic = options("lock_up", "BUN-VIC")
    fix_vic = options("fixout", "BUN-VIC")
    floor = options("flooring_decking")
    shelving = options("shelving")
    frame = options("frame_hardware")
    hardies = options("hardies_fire_walls")

    check("Flooring area type is bound", "Decking Input" in floor.get("typeArea", []))
    check("NSW Lockup width keeps 970", "970" in lock_nsw.get("width", []))
    check("VIC Lockup width excludes 970", "970" not in lock_vic.get("width", []))
    check("VIC Lockup uses HL", "HL" in lock_vic.get("internal_type", []))
    check("VIC Fixout width excludes 970", "970" not in fix_vic.get("width", []))
    check("Shelving type options are bound", shelving.get("type") == ["Robe", "Linen"])
    check("Frame wall class options are bound", "exterior_wall" in frame.get("wallClass", []))
    check("Hardies system options are bound", len(hardies.get("systemType", [])) >= 7)
    check("exact option resolver is case-insensitive", resolve_option_value("robe", ["Robe", "Linen"]) == "Robe")
    check("unknown dropdown text is rejected", resolve_option_value("ABC-NOT-REAL", ["Robe", "Linen"]) is None)
    check("canonical product code maps to exact option", resolve_option_value("405592", ["405592 · FC FLOORING SECURA"]) == "405592 · FC FLOORING SECURA")

    print("Document AI runtime option binding smoke test: PASS (11/11)")


if __name__ == "__main__":
    main()
