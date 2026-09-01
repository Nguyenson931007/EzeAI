"""
api/catalog_routes.py – DB Catalog API Router
=============================================
Exposes endpoints to query catalog items from [ProcurementApp]
according to customer_id and task_key for dynamic DB-driven dropdowns.
"""

import logging
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from app.catalog_repository import get_catalog

logger = logging.getLogger("ezefloor.catalog_routes")

router = APIRouter(prefix="/api/catalog", tags=["Catalog-router"])


@router.get("")
@router.get("/")
async def get_catalog_items(
    customer_id: str = Query(..., description="Customer short name e.g. BUN-NSW-ACT, CAIRNS-WOH"),
    task_key: str = Query(..., description="Task identifier e.g. eaves, insulation, flooring, cladding, etc.")
):
    """
    Returns deduplicated catalog items for the specified customer_id and task_key.
    """
    try:
        items = get_catalog(customer_id, task_key)
        return {
            "customerId": customer_id,
            "taskKey": task_key,
            "count": len(items),
            "items": items,
        }
    except Exception as e:
        logger.error(f"Error querying catalog items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
