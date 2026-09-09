"""
app/services/find_item_usage.py – Resolves product usage from using_find_items and data_find_items
"""
from typing import Callable, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.data_find import UsingFindItem, DataFindItem


def load_find_usage_resolver(db: Session, customer_id: str, task_key: str) -> Callable[[str], Optional[dict]]:
    """Return a lookup function that resolves product info by item_number or usage_key."""
    usage_rows = db.scalars(
        select(UsingFindItem).where(
            UsingFindItem.customer_id == customer_id,
            UsingFindItem.task_key == task_key,
            UsingFindItem.is_active.is_(True)
        )
    ).all()
    by_code = {str(r.item_number): r for r in usage_rows if r.item_number}
    by_key = {str(r.usage_key): r for r in usage_rows if r.usage_key}

    def resolver(key_or_code: str) -> Optional[dict]:
        k = str(key_or_code or "").strip()
        item = by_code.get(k) or by_key.get(k)
        if not item:
            return None
        return {
            "item_number": item.item_number,
            "description": item.description or item.display_name,
            "unit": "EA",
            "usage_key": item.usage_key,
            "formula_key": item.formula_key,
            "parameters_json": item.parameters_json,
        }

    return resolver
