"""Shared job Unit registry for EzeFloor <-> ProcurementApp.

The authoritative Unit list is the same ProcurementApp WorkPackInput table used
by Procurement.  EzeFloor inserts a tiny registry row only when the user clicks
"+ Unit"; therefore Procurement sees the new Unit on its next normal refresh.
"""
from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from api.auth import validate_session
from app.mssql_db import get_procurement_connection, get_mssql_connection

router = APIRouter(prefix="/api/work-pack-units", tags=["Work-pack units"])

DEFAULT_UNIT = "Unit 1"
REGISTRY_SHEET_ID = "__ezefloor_unit_registry__"
_UNIT_RE = re.compile(r"^Unit\s+(\d+)$", re.IGNORECASE)

_CREATE_TABLE_SQL = """
IF OBJECT_ID(N'[ProcurementApp].[dbo].[WorkPackInput]', N'U') IS NULL
BEGIN
    CREATE TABLE [ProcurementApp].[dbo].[WorkPackInput] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WorkPackInput PRIMARY KEY,
        customer_id NVARCHAR(100) NOT NULL,
        job_id NVARCHAR(100) NOT NULL,
        sheet_id NVARCHAR(150) NOT NULL,
        unit NVARCHAR(100) NULL,
        fields_data VARBINARY(MAX) NOT NULL,
        is_old_data BIT NOT NULL CONSTRAINT DF_WorkPackInput_is_old_data DEFAULT (0),
        user_update NVARCHAR(100) NULL,
        datetime_update DATETIME2 NOT NULL CONSTRAINT DF_WorkPackInput_datetime_update DEFAULT (SYSDATETIME())
    );
    CREATE INDEX IX_WorkPackInput_job
        ON [ProcurementApp].[dbo].[WorkPackInput] (customer_id, job_id, sheet_id, is_old_data)
        INCLUDE (datetime_update);
END
IF COL_LENGTH(N'[ProcurementApp].[dbo].[WorkPackInput]', N'unit') IS NULL
    ALTER TABLE [ProcurementApp].[dbo].[WorkPackInput] ADD unit NVARCHAR(100) NULL;
"""

class AddUnitRequest(BaseModel):
    unit: str | None = Field(default=None, max_length=100)


def _scope(customer_id: str, job_id: str) -> tuple[str, str]:
    customer = (customer_id or "").strip().upper()
    job = (job_id or "").strip()
    if not customer or not job:
        raise HTTPException(status_code=422, detail="Customer and job are required.")
    return customer, job


def _resolve_job_aliases(job_id: str) -> tuple[str, list[str]]:
    """Resolve IDJob / JobNumber / ClientJobNumber to one shared job key.

    Procurement normally sends IDJob while EzeFloor normally sends JobNumber.
    Future registry writes use JobNumber when available; reads/deletes accept all
    aliases so rows created before this fix remain visible to both apps.
    """
    raw = (job_id or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Job is required.")
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute("""
            SELECT TOP 1
                CAST(IDJob AS NVARCHAR(100)) AS id_job,
                LTRIM(RTRIM(ISNULL(CAST(JobNumber AS NVARCHAR(100)), ''))) AS job_number,
                LTRIM(RTRIM(ISNULL(CAST(ClientJobNumber AS NVARCHAR(100)), ''))) AS client_job_number
            FROM [Ezequotepersonalmanagement].[dbo].[ListJobs]
            WHERE CAST(IDJob AS NVARCHAR(100)) = %s
               OR UPPER(LTRIM(RTRIM(ISNULL(CAST(JobNumber AS NVARCHAR(100)), '')))) = UPPER(%s)
               OR UPPER(LTRIM(RTRIM(ISNULL(CAST(ClientJobNumber AS NVARCHAR(100)), '')))) = UPPER(%s)
        """, (raw, raw, raw))
        row = cursor.fetchone()
    except Exception:
        row = None
    finally:
        if conn:
            conn.close()
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
    cursor.execute("""
        IF OBJECT_ID(N'[ProcurementApp].[dbo].[WorkPackInput]', N'U') IS NULL
            SELECT CAST(NULL AS NVARCHAR(100)) AS unit WHERE 1 = 0;
        ELSE
            SELECT ISNULL(unit, N'Unit 1') AS unit
            FROM [ProcurementApp].[dbo].[WorkPackInput]
            WHERE customer_id = %s
              AND UPPER(LTRIM(RTRIM(job_id))) IN ({placeholders})
              AND ISNULL(is_old_data, 0) = 0
            GROUP BY ISNULL(unit, N'Unit 1');
    """.format(placeholders=','.join(['%s'] * len(job_aliases))), (customer, *[item.upper() for item in job_aliases]))
    rows = cursor.fetchall() or []
    values: list[str] = []
    for row in rows:
        if isinstance(row, dict):
            value = row.get("unit")
        else:
            value = row[0] if row else None
        if value:
            values.append(str(value))
    return _sort_units(values)


@router.get("/{customer_id}/jobs/{job_id}")
async def get_job_units(
    customer_id: str,
    job_id: str,
    _: str = Depends(validate_session),
):
    customer, raw_job = _scope(customer_id, job_id)
    canonical_job, aliases = _resolve_job_aliases(raw_job)
    conn = None
    try:
        conn = get_procurement_connection()
        cursor = conn.cursor(as_dict=True)
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
    """Create one Unit only after an explicit + Unit click in EzeFloor."""
    customer, raw_job = _scope(customer_id, job_id)
    job, aliases = _resolve_job_aliases(raw_job)
    conn = None
    try:
        conn = get_procurement_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(_CREATE_TABLE_SQL)
        conn.commit()

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
        cursor.execute("""
            INSERT INTO [ProcurementApp].[dbo].[WorkPackInput]
                (customer_id, job_id, sheet_id, unit, fields_data, is_old_data, user_update, datetime_update)
            VALUES
                (%s, %s, %s, %s, COMPRESS(CAST(N'{}' AS NVARCHAR(MAX))), 0, %s, SYSDATETIME())
        """, (customer, job, REGISTRY_SHEET_ID, target, user_update))
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

@router.delete("/{customer_id}/jobs/{job_id}/units/{unit}")
async def delete_job_unit(
    customer_id: str,
    job_id: str,
    unit: str,
    _: str = Depends(validate_session),
):
    """Delete one non-default shared Unit from Procurement WorkPackInput."""
    customer, raw_job = _scope(customer_id, job_id)
    _, aliases = _resolve_job_aliases(raw_job)
    target = _normalize_unit(unit)
    if target == DEFAULT_UNIT:
        raise HTTPException(status_code=422, detail="Unit 1 is the default Unit and cannot be deleted.")

    conn = None
    try:
        conn = get_procurement_connection()
        cursor = conn.cursor(as_dict=True)
        current = _read_units(cursor, customer, aliases)
        if target not in current:
            return {"success": True, "deleted_count": 0, "units": current}
        if len(current) <= 1:
            raise HTTPException(status_code=422, detail="The last Unit cannot be deleted.")

        placeholders = ','.join(['%s'] * len(aliases))
        cursor.execute(f"""
            DELETE FROM [ProcurementApp].[dbo].[WorkPackInput]
            WHERE customer_id = %s
              AND UPPER(LTRIM(RTRIM(job_id))) IN ({placeholders})
              AND ISNULL(unit, N'Unit 1') = %s
        """, (customer, *[item.upper() for item in aliases], target))
        deleted = int(cursor.rowcount or 0)
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

