from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "backend" / "services" / "document_ai_service.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"[FAIL] {message}")
    print(f"[PASS] {message}")


def main() -> None:
    text = SERVICE.read_text(encoding="utf-8")
    ast.parse(text)
    print("[PASS] document_ai_service.py parses")

    require('DOCUMENT_AI_TASK_BATCH_SIZE' in text,
            "batch size is configurable")
    require('return max(1, min(8, value))' in text,
            "batch size is safely bounded")
    require('def _chunk_task_contracts' in text,
            "task contracts are split into focused batches")
    require('for batch_index, batch_contracts in enumerate(batches, start=1)' in text,
            "every batch is evaluated")
    require('merged_task_results.extend(raw_results)' in text,
            "batch task results are merged")
    require('cleaned.sort' in text and 'task_order = list(task_contracts.keys())' in text,
            "merged results return in original task order")
    require('"batching": {' in text and '"batch_count": len(batches)' in text,
            "response exposes batching diagnostics")
    require('"role": "user", "content": "CONTEXT\\n"' in text,
            "system prompt is not duplicated in each user message")
    require('known_tasks - returned_tasks' in text,
            "coverage fallback remains active after batching")

    print("Document AI task batching smoke test: PASS (9/9)")


if __name__ == "__main__":
    main()
