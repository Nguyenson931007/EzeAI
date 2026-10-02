from __future__ import annotations

import sys
import types
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# The semantic resolver tests do not need a real Procurement connection. Keep
# this smoke test runnable in stripped CI/sandbox environments without pymssql.
if "app.catalog_repository" not in sys.modules:
    stub = types.ModuleType("app.catalog_repository")
    stub.get_catalog = lambda customer, task: []
    sys.modules["app.catalog_repository"] = stub

from services.document_ai_task_options import resolve_semantic_option_value
from services.document_ai_service import _clean_proposed_rows, _row_has_actionable_change


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    print(f"[PASS] {label}")


def main():
    check(
        "semantic resolver accepts reordered spec words",
        resolve_semantic_option_value("75 mm AAC", ["AAC 75mm", "James Hardie Oblique 300mm"]) == "AAC 75mm",
    )
    check(
        "semantic resolver accepts reordered branded spec",
        resolve_semantic_option_value(
            "James Hardie 300 mm Oblique",
            ["AAC 75mm", "James Hardie Oblique 300mm"],
        ) == "James Hardie Oblique 300mm",
    )
    check(
        "semantic resolver refuses ambiguous matches",
        resolve_semantic_option_value("AAC", ["AAC 50mm", "AAC 75mm"]) is None,
    )
    check(
        "semantic resolver refuses unrelated text",
        resolve_semantic_option_value("brick veneer", ["AAC 75mm", "James Hardie Oblique 300mm"]) is None,
    )

    contract = {
        "schema": {
            "fields": {
                "typeArea": {"type": "dropdown", "allow_gpt": True},
                "product": {"type": "dropdown", "allow_gpt": True},
            }
        },
        "options": {
            "typeArea": ["Dry", "Wet"],
            "product": [
                "0148884 · PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
                "405592 · FC FLOORING SECURA JH++2700X600X19MM INTERNAL",
            ],
        },
        "dependencies": {
            "product_by_typeArea": {
                "Dry": ["0148884 · PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP"],
                "Wet": ["405592 · FC FLOORING SECURA JH++2700X600X19MM INTERNAL"],
            }
        },
    }
    rows = _clean_proposed_rows(
        [{"action": "ADD", "typeArea": "Dry", "confidence": 0.9}],
        {"rows": []},
        "flooring_decking",
        "BUN-NSW-ACT",
        contract,
    )
    check("flooring product is derived from unique customer mapping", rows[0].get("product", "").startswith("0148884 ·"))
    check("derived product stays actionable", _row_has_actionable_change(rows[0], "flooring_decking", "BUN-NSW-ACT"))

    ambiguous_contract = {
        **contract,
        "dependencies": {"product_by_typeArea": {"Dry": contract["options"]["product"]}},
    }
    ambiguous_rows = _clean_proposed_rows(
        [{"action": "ADD", "typeArea": "Dry"}],
        {"rows": []},
        "flooring_decking",
        "BUN-NSW-ACT",
        ambiguous_contract,
    )
    check("ambiguous product dependency is not guessed", "product" not in ambiguous_rows[0])

    print("Document AI semantic mapping smoke test: PASS (7/7)")


if __name__ == "__main__":
    main()
