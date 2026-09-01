# Adapt imports to the team's FastAPI project.
# from fastapi import APIRouter, Depends
# from .database import get_db
from catalog_repository import get_catalog

# router = APIRouter()

# @router.get("/catalog")
def catalog(customer_id: str, task_key: str, db):
    return {
        "customerId": customer_id,
        "taskKey": task_key,
        "items": get_catalog(db, customer_id, task_key),
    }
