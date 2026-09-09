from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.data_find import DataFindItem


_CONFIG_PATH = Path(__file__).with_name("selector_variants.json")
_QUERY_CHUNK_SIZE = 1_000


@lru_cache(maxsize=1)
def _definitions() -> tuple[dict[str, Any], ...]:
    """Return BUN selector rules stored in code, never in product metadata."""
    value = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError("BUN NSW selector_variants.json must contain a list")
    return tuple(row for row in value if isinstance(row, dict))


def load_selector_variants(
    db: Session,
    *,
    task_keys: Iterable[str] | None = None,
    formula_keys: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """Combine code-owned selector rules with DB-owned product details.

    The JSON file owns only option/matching data and an item-number reference.
    Product description and unit remain authoritative in ``data_find_items``.
    """
    wanted_tasks = {str(value).strip() for value in (task_keys or ()) if str(value).strip()}
    wanted_formulas = {str(value).strip() for value in (formula_keys or ()) if str(value).strip()}
    definitions = [
        row for row in _definitions()
        if (not wanted_tasks or str(row.get("task_key") or "") in wanted_tasks)
        and (not wanted_formulas or str(row.get("formula_key") or "") in wanted_formulas)
    ]

    codes = sorted({str(row.get("item_number") or "").strip() for row in definitions} - {""})
    products: dict[str, DataFindItem] = {}
    for start in range(0, len(codes), _QUERY_CHUNK_SIZE):
        chunk = codes[start:start + _QUERY_CHUNK_SIZE]
        rows = db.scalars(select(DataFindItem).where(
            DataFindItem.customer_id == "BUN-NSW-ACT",
            DataFindItem.item_number.in_(chunk),
        )).all()
        products.update({row.item_number: row for row in rows})

    result: list[dict[str, Any]] = []
    for definition in definitions:
        code = str(definition.get("item_number") or "").strip()
        product = products.get(code)
        # Selector definitions must never create products. A missing catalog
        # item stays visibly unresolved instead of being silently invented.
        result.append({
            "task_key": str(definition.get("task_key") or ""),
            "formula_key": str(definition.get("formula_key") or ""),
            "item_number": code,
            "description": product.item_description if product else "",
            "unit": product.unit if product else "EA",
            "parameters": definition.get("parameters") if isinstance(definition.get("parameters"), dict) else {},
            "mapping_missing": product is None,
        })
    return result

