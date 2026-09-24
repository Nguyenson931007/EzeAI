"""
api/catalog_routes.py – DB Catalog API Router
=============================================
Exposes the runtime catalog using exact customer_id + task_key values.
No hard-coded customer/task aliases.
"""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.catalog_repository import get_catalog

logger = logging.getLogger("ezefloor.catalog_routes")

router = APIRouter(prefix="/api/catalog", tags=["Catalog"])


@router.get("")
@router.get("/")
def get_catalog_items(
    customer_id: str = Query(..., min_length=1, description="Exact customer_id stored in using_find_items"),
    task_key: str = Query(..., min_length=1, description="Exact task_key stored in using_find_items"),
):
    """Return active, canonical, deduplicated catalog items."""
    customer_id = customer_id.strip()
    task_key = task_key.strip()

    if not customer_id or not task_key:
        raise HTTPException(
            status_code=422,
            detail="customer_id and task_key are required",
        )

    try:
        items = get_catalog(customer_id, task_key)
    except Exception:
        logger.exception(
            "Catalog endpoint failed: customer=%r task=%r",
            customer_id,
            task_key,
        )
        # Do not leak SQL/connection details to the browser.
        raise HTTPException(
            status_code=500,
            detail="Failed to load catalog from database",
        )

    return {
        "customerId": customer_id,
        "taskKey": task_key,
        "count": len(items),
        "items": items,
    }
