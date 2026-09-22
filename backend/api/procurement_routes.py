"""Procurement-compatible read-only API surface for EzeFloor forms.

The route names intentionally match ProcurementApp so both frontends consume
one contract.  No endpoint in this router mutates SQL Server.
"""

from fastapi import APIRouter, HTTPException, Query

from app.catalog_repository import get_catalog, get_customer_catalog
from app.customer_modules.registry import customer_rows, task_rows

router = APIRouter(tags=["Procurement catalog"])


@router.get("/data-find/using")
def list_using_find_items(
    customer_id: str = Query(..., min_length=1, max_length=100),
    task_key: str = Query(..., min_length=1, max_length=120),
):
    try:
        return get_catalog(customer_id, task_key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load Procurement catalog") from exc


@router.get("/data-find/using/all")
def list_all_using_find_items(
    customer_id: str = Query(..., min_length=1, max_length=100),
):
    try:
        return get_customer_catalog(customer_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load Procurement catalog") from exc


@router.get("/workflow/customers")
def list_workflow_customers():
    return customer_rows()


@router.get("/workflow/customers/{customer_id}/tasks")
def list_customer_tasks(customer_id: str):
    rows = task_rows(customer_id)
    if rows:
        return rows
    # For customers not yet represented in the static UI registry, expose the
    # task keys actually present in ProcurementApp rather than inventing forms.
    try:
        catalog = get_customer_catalog(customer_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load customer tasks") from exc
    seen = []
    for row in catalog:
        key = str(row.get("task_key") or "").strip()
        if key and key not in seen:
            seen.append(key)
    return [{"id": key, "name": key.replace("-", " ").title(), "sheet": key, "description": ""} for key in seen]
