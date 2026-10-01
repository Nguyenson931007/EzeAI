from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from services.document_ai_task_schema import build_task_contracts, get_task_schema, gpt_allowed_fields


def check(name: str, condition: bool) -> None:
    if not condition:
        raise AssertionError(name)
    print(f"[PASS] {name}")


def main() -> None:
    three = ["BUN-NSW-ACT", "BUN-SEQLD", "BUN-VIC"]
    expected = {
        "frame_hardware", "flooring_decking", "hebel_flooring", "insulation",
        "eaves_soffit", "cladding", "lock_up", "fixout", "windows", "shelving",
        "timber_posts", "power_truss_braces", "fow_plumbing", "final_fit", "hardies_fire_walls",
    }
    for customer in three:
        for key in expected:
            schema = get_task_schema(key, customer)
            check(f"{customer} {key} schema exists", bool(schema))
            check(f"{customer} {key} has fields", bool(schema.get("fields")))

    check("lockup alias normalizes", get_task_schema("lockup", "BUN-SEQLD").get("task_key") == "lock_up")
    check("VIC lockup shares schema", set(get_task_schema("lock_up", "BUN-VIC")["fields"]) == set(get_task_schema("lock_up", "BUN-SEQLD")["fields"]))
    check("VIC override retained", get_task_schema("lock_up", "BUN-VIC").get("customer_override", {}).get("field_labels", {}).get("internal_type") == "HO/HL")
    check("flooring is aggregate", get_task_schema("flooring_decking", "BUN-NSW-ACT").get("output_mode") == "aggregate")
    check("eaves is single-form", get_task_schema("eaves_soffit", "BUN-SEQLD").get("output_mode") == "single_form")
    check("geometry field blocked from GPT", "areaM2" not in gpt_allowed_fields("flooring_decking", "BUN-VIC"))
    check("dropdown field allowed for GPT", "typeArea" in gpt_allowed_fields("flooring_decking", "BUN-VIC"))

    tasks = {
        "flooring_decking": {"mode": "rows", "rows": [{"id": "r1", "typeArea": "Dry", "areaM2": 10}], "form": {}},
        "lock_up": {"mode": "rows", "rows": [{"id": "d1", "door_type": "HAG6"}], "form": {}},
        "eaves_soffit": {"mode": "form", "rows": [], "form": {"eave_width": "450"}},
    }
    contracts = build_task_contracts(tasks, "BUN-SEQLD")
    check("contracts preserve all supplied supported tasks", set(contracts) == set(tasks))
    check("current rows kept separate from schema", contracts["lock_up"]["current_data"]["rows"][0]["id"] == "d1")
    check("schema does not copy live values", "HAG6" not in json.dumps(contracts["lock_up"]["schema"]))

    print("Document AI task schema smoke test: PASS")


if __name__ == "__main__":
    main()
