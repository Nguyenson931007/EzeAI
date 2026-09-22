from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.data_find import DataFindItem, UsingFindItem


def usage_parameters(row: Any, *, include_legacy: bool = True) -> dict[str, Any]:
    """Return mapping metadata from typed using_find_items columns only."""
    if isinstance(row, UsingFindItem):
        return row.metadata_dict()
    if isinstance(row, dict):
        embedded = row.get("parameters")
        if isinstance(embedded, dict):
            return dict(embedded)
        values = row.get("values")
        if isinstance(values, dict):
            return dict(values)
    return {}


def catalog_by_usage(
    db: Session,
    usages: Iterable[UsingFindItem],
    *,
    customer_id: str,
) -> dict[int, DataFindItem]:
    rows = list(usages)
    ids = {row.data_find_item_id for row in rows if row.data_find_item_id is not None}
    codes = {str(row.item_number) for row in rows if row.item_number}
    if not ids and not codes:
        return {}
    predicates = []
    if ids:
        predicates.append(DataFindItem.id.in_(ids))
    if codes:
        predicates.append(DataFindItem.item_number.in_(codes))
    products = list(db.scalars(select(DataFindItem).where(
        DataFindItem.customer_id == customer_id,
        or_(*predicates),
    )).all())
    by_id = {item.id: item for item in products}
    by_code = {item.item_number: item for item in products}
    return {
        row.id: by_id.get(row.data_find_item_id) or by_code.get(str(row.item_number or ""))
        for row in rows
        if by_id.get(row.data_find_item_id) or by_code.get(str(row.item_number or ""))
    }
