"""Shared job Unit registry for EzeFloor <-> ProcurementApp.

Business SQL is implemented in SQL Server stored procedures. This module keeps
only validation, API flow and transaction handling so SQL condition changes can
be deployed without rebuilding EzeFloor.
"""
from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from api.auth import validate_session
from app.mssql_db import get_procurement_connection
from app.stored_procedures import csv_values, execute_procedure

router = APIRouter(prefix="/api/work-pack-units", tags=["Work-pack units"])

DEFAULT_UNIT = "Unit 1"
REGISTRY_SHEET_ID = "__ezefloor_unit_registry__"
_UNIT_RE = re.compile(r"^Unit\s+(\d+)$", re.IGNORECASE)

SP_ENSURE_SCHEMA = "dbo.usp_EzeFloor_WorkPackUnit_EnsureSchema"
SP_RESOLVE_JOB = "dbo.usp_EzeFloor_WorkPackUnit_ResolveJob"
SP_LIST = "dbo.usp_EzeFloor_WorkPackUnit_List"
SP_ADD = "dbo.usp_EzeFloor_WorkPackUnit_Add"
SP_RENAME = "dbo.usp_EzeFloor_WorkPackUnit_Rename"
SP_DELETE = "dbo.usp_EzeFloor_WorkPackUnit_Delete"


class AddUnitRequest(BaseModel):
    unit: str | None = Field(default=None, max_length=100)


class RenameUnitRequest(BaseModel):
    new_unit: str = Field(min_length=1, max_length=100)


def _scope(customer_id: str, job_id: str) -> tuple[str, str]:
    customer = (customer_id or "").strip().upper()
    job = (job_id or "").strip()
    if not customer or not job:
        raise HTTPException(status_code=422, detail="Customer and job are required.")
    return customer, job


def _resolve_job_aliases(cursor, job_id: str) -> tuple[str, list[str]]:
    """Resolve IDJob / JobNumber / ClientJobNumber through SQL Server."""
    raw = (job_id or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Job is required.")

    execute_procedure(cursor, SP_RESOLVE_JOB, {"job_id": raw})
    row = cursor.fetchone()
    if not row:
        return raw, [raw]

    aliases: list[str] = []
    seen: set[str] = set()
    for value in [row.get("id_job"), row.get("job_number"), row.get("client_job_number"), raw]:
        value = str(value or "").strip()
        key = value.upper()
        if value and key not in seen:
            seen.add(key)
            aliases.append(value)
    canonical = str(row.get("job_number") or "").strip() or str(row.get("id_job") or "").strip() or raw
    return canonical, aliases or [canonical]


def _normalize_unit(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_UNIT
    match = _UNIT_RE.fullmatch(raw)
    if not match or int(match.group(1)) < 1:
        raise HTTPException(status_code=422, detail='Unit must use the format "Unit N".')
    return f"Unit {int(match.group(1))}"


def _sort_units(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in [DEFAULT_UNIT, *values]:
        try:
            item = _normalize_unit(value)
        except HTTPException:
            continue
        if item not in seen:
            seen.add(item)
            normalized.append(item)
    return sorted(normalized, key=lambda item: int(_UNIT_RE.fullmatch(item).group(1)))


def _read_units(cursor, customer: str, job_aliases: list[str]) -> list[str]:
    execute_procedure(
        cursor,
        SP_LIST,
        {"customer_id": customer, "job_aliases_csv": csv_values(job_aliases)},
    )
    rows = cursor.fetchall() or []
    values = [str(row.get("unit")) for row in rows if isinstance(row, dict) and row.get("unit")]
    return _sort_units(values)


def _open_procurement():
    conn = get_procurement_connection()
    return conn, conn.cursor(as_dict=True)


@router.get("/{customer_id}/jobs/{job_id}")
async def get_job_units(customer_id: str, job_id: str, _: str = Depends(validate_session)):
    customer, raw_job = _scope(customer_id, job_id)
    conn = None
    try:
        conn, cursor = _open_procurement()
        canonical_job, aliases = _resolve_job_aliases(cursor, raw_job)
        units = _read_units(cursor, customer, aliases)
        return {"success": True, "unit": units[0], "units": units, "job_key": canonical_job}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load Units: {exc}")
    finally:
        if conn:
            conn.close()


@router.post("/{customer_id}/jobs/{job_id}")
async def add_job_unit(
    customer_id: str,
    job_id: str,
    payload: AddUnitRequest,
    request: Request,
    _: str = Depends(validate_session),
):
    customer, raw_job = _scope(customer_id, job_id)
    conn = None
    try:
        conn, cursor = _open_procurement()
        execute_procedure(cursor, SP_ENSURE_SCHEMA)
        conn.commit()

        job, aliases = _resolve_job_aliases(cursor, raw_job)
        current = _read_units(cursor, customer, aliases)
        if payload.unit:
            target = _normalize_unit(payload.unit)
        else:
            used = {int(_UNIT_RE.fullmatch(item).group(1)) for item in current if _UNIT_RE.fullmatch(item)}
            number = 1
            while number in used:
                number += 1
            target = f"Unit {number}"

        if target in current:
            return {"success": True, "unit": target, "units": current, "created": False}

        user_update = (request.headers.get("x-username") or "EzeFloor").strip() or "EzeFloor"
        execute_procedure(
            cursor,
            SP_ADD,
            {
                "customer_id": customer,
                "job_id": job,
                "sheet_id": REGISTRY_SHEET_ID,
                "unit": target,
                "user_update": user_update,
            },
        )
        conn.commit()
        units = _read_units(cursor, customer, aliases + [job])
        return {"success": True, "unit": target, "units": units, "created": True}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Could not create Unit: {exc}")
    finally:
        if conn:
            conn.close()


@router.post("/{customer_id}/jobs/{job_id}/units/{unit}/rename")
async def rename_job_unit(
    customer_id: str,
    job_id: str,
    unit: str,
    payload: RenameUnitRequest,
    request: Request,
    _: str = Depends(validate_session),
):
    customer, raw_job = _scope(customer_id, job_id)
    current_unit = _normalize_unit(unit)
    next_unit = _normalize_unit(payload.new_unit)
    if current_unit == next_unit:
        return {"success": True, "unit": next_unit, "units": []}

    conn = None
    try:
        conn, cursor = _open_procurement()
        _, aliases = _resolve_job_aliases(cursor, raw_job)
        current = _read_units(cursor, customer, aliases)
        if current_unit not in current:
            raise HTTPException(status_code=404, detail=f"{current_unit} was not found.")
        if next_unit in current:
            raise HTTPException(status_code=409, detail=f"{next_unit} already exists.")

        user_update = (request.headers.get("x-username") or "EzeFloor").strip() or "EzeFloor"
        execute_procedure(
            cursor,
            SP_RENAME,
            {
                "customer_id": customer,
                "job_aliases_csv": csv_values(aliases),
                "current_unit": current_unit,
                "new_unit": next_unit,
                "user_update": user_update,
            },
        )
        conn.commit()
        units = _read_units(cursor, customer, aliases)
        return {"success": True, "unit": next_unit, "units": units}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Could not rename Unit: {exc}")
    finally:
        if conn:
            conn.close()


@router.delete("/{customer_id}/jobs/{job_id}/units/{unit}")
async def delete_job_unit(customer_id: str, job_id: str, unit: str, _: str = Depends(validate_session)):
    customer, raw_job = _scope(customer_id, job_id)
    target = _normalize_unit(unit)
    if target == DEFAULT_UNIT:
        raise HTTPException(status_code=422, detail="Unit 1 is the default Unit and cannot be deleted.")

    conn = None
    try:
        conn, cursor = _open_procurement()
        _, aliases = _resolve_job_aliases(cursor, raw_job)
        current = _read_units(cursor, customer, aliases)
        if target not in current:
            return {"success": True, "deleted_count": 0, "units": current}
        if len(current) <= 1:
            raise HTTPException(status_code=422, detail="The last Unit cannot be deleted.")

        execute_procedure(
            cursor,
            SP_DELETE,
            {"customer_id": customer, "job_aliases_csv": csv_values(aliases), "unit": target},
        )
        row = cursor.fetchone() or {}
        deleted = int(row.get("affected_rows") or 0) if isinstance(row, dict) else 0
        conn.commit()
        units = _read_units(cursor, customer, aliases)
        return {"success": True, "deleted_count": deleted, "units": units}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Could not delete Unit: {exc}")
    finally:
        if conn:
            conn.close()
