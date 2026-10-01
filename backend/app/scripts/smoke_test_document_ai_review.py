from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND_SERVICE = ROOT / "backend" / "services" / "document_ai_service.py"
PANE = ROOT / "frontend_next" / "src" / "views" / "RightPropertyPaneView.jsx"
CONTAINER = ROOT / "frontend_next" / "src" / "views" / "right-property-pane" / "TaskModulesContainer.jsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"[FAIL] {message}")
    print(f"[PASS] {message}")


def main() -> None:
    service_text = BACKEND_SERVICE.read_text(encoding="utf-8")
    pane_text = PANE.read_text(encoding="utf-8")
    container_text = CONTAINER.read_text(encoding="utf-8")

    ast.parse(service_text)
    print("[PASS] document_ai_service.py parses")

    require('"ADD", "UPDATE", "DELETE", "KEEP", "UNKNOWN"' in service_text,
            "backend normalizes GPT row actions")
    require("_FORBIDDEN_GEOMETRY_KEYS" in service_text,
            "backend rejects geometry fields from GPT task proposals")
    require("_allowed_row_fields" in service_text,
            "backend constrains GPT row fields to current task context when schema exists")
    require('_gptAction: action' in pane_text,
            "frontend stages GPT action metadata")
    require('action === "UPDATE"' in pane_text,
            "frontend applies UPDATE proposals by existing row id")
    require('action === "DELETE"' in pane_text and "window.confirm" in pane_text,
            "frontend requires confirmation before GPT DELETE")
    require('action === "KEEP" || action === "UNKNOWN"' in pane_text,
            "frontend does not apply KEEP/UNKNOWN proposals")
    require("Clear all non-GPT rows" in pane_text,
            "Clear non-GPT requires explicit confirmation")
    require("_gptSourcePage" in container_text and "_gptConfidence" in container_text,
            "GPT review rows show source/confidence metadata")

    print("Document AI review smoke test: PASS")


if __name__ == "__main__":
    main()
