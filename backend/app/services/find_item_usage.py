"""Resolve Procurement product usages from the typed using_find_items schema."""

from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.data_find import UsingFindItem


def load_find_usage_resolver(
    db: Session,
    customer_id: str,
    task_key: str,
) -> Callable[[str], Optional[dict]]:
    usage_rows = db.scalars(
        select(UsingFindItem).where(
            UsingFindItem.customer_id == customer_id,
            UsingFindItem.sheet_key == task_key,
            UsingFindItem.is_active.is_(True),
        )
    ).all()
    by_code = {str(row.item_number): row for row in usage_rows if row.item_number}
    by_key = {str(row.node_key): row for row in usage_rows if row.node_key}

    def resolver(key_or_code: str) -> Optional[dict]:
        key = str(key_or_code or "").strip()
        item = by_code.get(key) or by_key.get(key)
        if not item:
            return None
        return {
            "item_number": item.item_number,
            "description": item.description or item.name,
            "unit": item.unit or "EA",
            "usage_key": item.node_key,
            "formula_key": item.formula_key,
            "parameters": item.metadata_dict(),
        }

    return resolver
