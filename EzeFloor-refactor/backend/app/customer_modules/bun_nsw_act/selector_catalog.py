from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import select, true
from sqlalchemy.orm import Session

from app.models.data_find import DataFindItem, UsingFindItem


_QUERY_CHUNK_SIZE = 1_000


def load_selector_variants(
    db: Session,
    *,
    task_keys: Iterable[str] | None = None,
    formula_keys: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """Load Fixout selector -> product mappings from ``using_find_items``.

    Lock-up no longer uses this generic selector path. Door/Jamb/Entry/Frame
    matching is owned by the dedicated Lock-up catalog tables.
    """
    wanted_tasks = {str(value).strip() for value in (task_keys or ()) if str(value).strip()}
    wanted_formulas = {str(value).strip() for value in (formula_keys or ()) if str(value).strip()}
    definitions: list[dict[str, Any]] = []

    if not wanted_tasks or "fixout" in wanted_tasks:
        stmt = select(UsingFindItem).where(
            UsingFindItem.customer_id == "BUN-NSW-ACT",
            UsingFindItem.sheet_key == "fixout",
            UsingFindItem.is_active == true(),
        )
        if wanted_formulas:
            stmt = stmt.where(UsingFindItem.formula_key.in_(sorted(wanted_formulas)))
        for row in db.scalars(stmt.order_by(UsingFindItem.sort_order, UsingFindItem.id)).all():
            definitions.append({
                "task_key": "fixout",
                "formula_key": row.formula_key or "",
                "item_number": row.item_number or "",
                "description": row.description or "",
                "unit": row.unit or "",
                "parameters": row.metadata_dict(),
            })


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
        product = products.get(code) if code else None
        fallback_description = str(definition.get("description") or "").strip()
        fallback_unit = str(definition.get("unit") or "").strip()
        result.append({
            "task_key": str(definition.get("task_key") or ""),
            "formula_key": str(definition.get("formula_key") or ""),
            "item_number": code,
            "description": product.item_description if product else fallback_description,
            "unit": product.unit if product else (fallback_unit or "EA"),
            "parameters": definition.get("parameters") if isinstance(definition.get("parameters"), dict) else {},
            "mapping_missing": bool(code and product is None),
        })
    return result
