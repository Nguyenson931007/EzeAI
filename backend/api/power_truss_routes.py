import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.power_truss")

router = APIRouter(prefix="/api/power-truss", tags=["PowerTrussBraces-router"])


def _parse_decimal(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Chuyển đổi an toàn chuỗi sang số float/decimal cho MSSQL."""
    if val is None:
        return default
    s = str(val).strip()
    match = re.search(r"[-+]?\d*\.?\d+", s)
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            return default
    return default


def _row_value(row: Any, key: str, index: int) -> Any:
    if isinstance(row, dict):
        return row.get(key)
    return row[index]


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class PowerTrussItemSchema(BaseModel):
    wall_height: Optional[str] = Field(None, description="Chiều cao tường (VD: 2400, 2700)")
    wallHeight: Optional[str] = Field(None, description="Alias chiều cao tường")
    length: Optional[str] = Field(None, description="Chiều dài (VD: 3000, 6000)")
    type: Optional[str] = Field(None, description="Loại: 'Column' hoặc 'Brace'")
    qty: Optional[Union[float, int, str]] = Field(None, description="Số lượng")


class PowerTrussJobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id)")
    items: Optional[List[PowerTrussItemSchema]] = Field(
        None,
        description="Danh sách các dòng Power Truss Braces cho mỗi Job",
    )
    truss_items: Optional[List[PowerTrussItemSchema]] = Field(
        None,
        description="Alias cho danh sách các dòng Power Truss Braces",
    )


class SavePowerTrussPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[PowerTrussJobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu Power Truss Braces")


# ══════════════════════════════════════════════════════
# HELPER: Resolve id_job_hw từ MSSQL
# ══════════════════════════════════════════════════════

def _resolve_power_truss_job(cursor: Any, input_job_id: str) -> str:
    """Xác nhận id_job_hw tồn tại trong task_group_hw và trả về ID chính xác, hoặc fallback input_job_id nếu là testing/custom."""
    raw_id = str(input_job_id).strip()
    if not raw_id:
        raise HTTPException(status_code=422, detail="id_job_hw không được để trống.")

    base_select = """
        SELECT TOP 2
            CAST(tghw.id AS nvarchar(100)) AS id
        FROM [emsflow].[dbo].[task_group_hw] AS tghw
        LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] AS lj
            ON tghw.id_job_ems = lj.IDJob
           AND ISNULL(lj.IsDelete, 0) = 0
        WHERE ISNULL(tghw.is_delete, 0) = 0
          AND {condition}
        ORDER BY tghw.created_at DESC, tghw.id
    """
    lookups = (
        ("CAST(tghw.id AS nvarchar(100)) = %s", (raw_id,)),
        ("CAST(tghw.id_job_ems AS nvarchar(100)) = %s", (raw_id,)),
        ("LOWER(LTRIM(RTRIM(lj.JobNumber))) = LOWER(LTRIM(RTRIM(%s)))", (raw_id,)),
    )
    for condition, params in lookups:
        try:
            cursor.execute(base_select.format(condition=condition), params)
            rows = cursor.fetchall()
            if rows:
                row = rows[0]
                job_hw_id = str(_row_value(row, "id", 0) or "").strip()
                if job_hw_id:
                    return job_hw_id
        except Exception as e:
            logger.warning(f"Power Truss lookup attempt failed: {e}")

    # Fallback cho testing / standalone plan
    return raw_id


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC POWER TRUSS BRACES HIỆN TẠI (GET /api/power-truss/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_power_truss_jobs(
    id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw or job_number"),
    office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"),
):
    """
    Truy vấn danh sách Power Truss Braces jobs từ MSSQL [ProcurementApp].[dbo].[PowerTrussBraces].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ptb.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        normalized_hw_id = (id_job_hw or "").strip() or None

        sql = """
            SELECT
                ptb.ID AS id,
                ptb.IdJob_HW AS id_job_hw,
                ptb.WallHeight AS wall_height,
                ptb.Length AS length,
                ptb.Type AS type,
                ptb.Qty AS qty,
                ptb.UserUpdate AS user_update,
                ptb.DatetimeUpdate AS datetime_update,
                ptb.IsOldData AS is_old_data,

                tghw.id AS hw_id,
                tghw.id_job_ems,

                lj.JobNumber AS job_number

            FROM [ProcurementApp].[dbo].[PowerTrussBraces] ptb

            LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw
                ON tghw.id = ptb.IdJob_HW
               AND ISNULL(tghw.is_delete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(ptb.IsOldData, 0) = 0
                AND (%s IS NULL OR CAST(ptb.IdJob_HW AS nvarchar(100)) = %s OR CAST(tghw.id AS nvarchar(100)) = %s OR CAST(lj.JobNumber AS nvarchar(100)) = %s)
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s OR UPPER(LTRIM(RTRIM(ptb.UserUpdate))) = %s)

            ORDER BY ptb.DatetimeUpdate DESC, ptb.ID;
        """
        cursor.execute(sql, (
            normalized_hw_id, normalized_hw_id, normalized_hw_id, normalized_hw_id,
            normalized_office, normalized_office, normalized_office
        ))
        rows = cursor.fetchall()

        result = []
        for r in rows:
            result.append({
                "id": r.get("id"),
                "id_job_hw": r.get("id_job_hw"),
                "wall_height": str(r.get("wall_height") or ""),
                "wallHeight": str(r.get("wall_height") or ""),
                "length": str(r.get("length") or ""),
                "type": str(r.get("type") or "Column"),
                "qty": float(r.get("qty")) if r.get("qty") is not None else 1.0,
                "user_update": r.get("user_update"),
                "datetime_update": r.get("datetime_update").isoformat() if r.get("datetime_update") else None,
                "is_old_data": r.get("is_old_data"),
                "job_number": r.get("job_number") or str(r.get("id_job_hw")),
            })

        return {
            "success": True,
            "total": len(result),
            "data": result,
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn Power Truss Braces jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU POWER TRUSS BRACES JOBS (POST /api/power-truss/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_power_truss_jobs(payload: SavePowerTrussPayloadSchema):
    """
    Lưu danh sách Power Truss Braces vào MSSQL [ProcurementApp].[dbo].[PowerTrussBraces].
    Quy trình versioning chuẩn:
      1. Lưu các bản ghi cũ của Job thành IsOldData = 1.
      2. Chèn toàn bộ các bản ghi mới với IsOldData = 0.
    """
    user_update = payload.user_update.strip()
    if not user_update:
        raise HTTPException(status_code=422, detail="user_update không được để trống.")

    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)
        cursor = conn.cursor(as_dict=True)

        sql_archive_old = """
            UPDATE [ProcurementApp].[dbo].[PowerTrussBraces]
            SET IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE IdJob_HW = %s
              AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[PowerTrussBraces] (
                IdJob_HW,
                WallHeight,
                Length,
                Type,
                Qty,
                UserUpdate,
                DatetimeUpdate,
                IsOldData
            ) VALUES (
                %s, %s, %s, %s, %s, %s, GETDATE(), 0
            );
        """

        saved_jobs = []
        for job in payload.jobs:
            job_hw_id = _resolve_power_truss_job(cursor, job.id_job_hw)

            # 1. Archive bản ghi cũ
            cursor.execute(sql_archive_old, (user_update, job_hw_id))

            # 2. Thêm mới
            items = job.items if job.items is not None else job.truss_items
            inserted_count = 0
            if items:
                for item in items:
                    wh_val = str(item.wall_height or item.wallHeight or "").strip() or None
                    len_val = str(item.length or "").strip() or None
                    type_val = str(item.type or "Column").strip()
                    qty_val = _parse_decimal(item.qty, default=1.0)

                    # Bỏ qua dòng trống hoàn toàn
                    if not wh_val and not len_val:
                        continue

                    cursor.execute(sql_insert_new, (
                        job_hw_id,
                        wh_val,
                        len_val,
                        type_val,
                        qty_val,
                        user_update,
                    ))
                    inserted_count += 1

            saved_jobs.append({
                "id_job_hw": job_hw_id,
                "inserted_count": inserted_count,
            })

        conn.commit()

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(saved_jobs)} Power Truss Braces job(s).",
            "saved_jobs": saved_jobs,
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Lỗi khi lưu Power Truss Braces jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error khi lưu Power Truss Braces: {str(e)}")
    finally:
        if conn:
            conn.close()
