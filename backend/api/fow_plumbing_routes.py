import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.fow_plumbing")

router = APIRouter(prefix="/api/fow-plumbing", tags=["FOWPlumbing-router"])


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

class FowPlumbingItemSchema(BaseModel):
    item_name: Optional[str] = Field(None, description="Tên thiết bị (VD: Basin Mixer, Shower Mixer, Toilet Suite)")
    itemName: Optional[str] = Field(None, description="Alias tên thiết bị")
    code: Optional[str] = Field(None, description="Mã vật tư/thiết bị")
    description: Optional[str] = Field(None, description="Mô tả chi tiết")
    qty: Optional[Union[float, int, str]] = Field(None, description="Số lượng")
    note: Optional[str] = Field(None, description="Ghi chú")


class FowPlumbingJobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id)")
    items: Optional[List[FowPlumbingItemSchema]] = Field(
        None,
        description="Danh sách các dòng FOW Plumbing cho mỗi Job",
    )
    plumbing_items: Optional[List[FowPlumbingItemSchema]] = Field(
        None,
        description="Alias cho danh sách các dòng FOW Plumbing",
    )


class SaveFowPlumbingPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[FowPlumbingJobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu FOW Plumbing")


# ══════════════════════════════════════════════════════
# HELPER: Resolve id_job_hw từ MSSQL
# ══════════════════════════════════════════════════════

def _resolve_fow_plumbing_job(cursor: Any, input_job_id: str) -> str:
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
            logger.warning(f"FOW Plumbing lookup attempt failed: {e}")

    # Fallback cho testing / standalone plan
    return raw_id


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC FOW PLUMBING HIỆN TẠI (GET /api/fow-plumbing/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_fow_plumbing_jobs(
    id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw or job_number"),
    office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"),
):
    """
    Truy vấn danh sách FOW Plumbing jobs từ MSSQL [ProcurementApp].[dbo].[FOWPlumbing].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(fp.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        normalized_hw_id = (id_job_hw or "").strip() or None

        sql = """
            SELECT
                fp.ID AS id,
                fp.IdJob_HW AS id_job_hw,
                fp.itemName AS item_name,
                fp.code AS code,
                fp.description AS description,
                fp.qty AS qty,
                fp.note AS note,
                fp.UserUpdate AS user_update,
                fp.DatetimeUpdate AS datetime_update,
                fp.IsOldData AS is_old_data,

                tghw.id AS hw_id,
                tghw.id_job_ems,

                lj.JobNumber AS job_number

            FROM [ProcurementApp].[dbo].[FOWPlumbing] fp

            LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw
                ON tghw.id = fp.IdJob_HW
               AND ISNULL(tghw.is_delete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(fp.IsOldData, 0) = 0
                AND (%s IS NULL OR CAST(fp.IdJob_HW AS nvarchar(100)) = %s OR CAST(tghw.id AS nvarchar(100)) = %s OR CAST(lj.JobNumber AS nvarchar(100)) = %s)
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s OR UPPER(LTRIM(RTRIM(fp.UserUpdate))) = %s)

            ORDER BY fp.DatetimeUpdate DESC, fp.ID;
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
                "item_name": r.get("item_name") or "",
                "code": r.get("code") or "",
                "description": r.get("description") or "",
                "qty": float(r.get("qty")) if r.get("qty") is not None else 1.0,
                "note": r.get("note") or "",
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
        logger.error(f"Lỗi truy vấn FOW Plumbing jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU FOW PLUMBING JOBS (POST /api/fow-plumbing/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_fow_plumbing_jobs(payload: SaveFowPlumbingPayloadSchema):
    """
    Lưu danh sách thiết bị FOW Plumbing vào MSSQL [ProcurementApp].[dbo].[FOWPlumbing].
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
            UPDATE [ProcurementApp].[dbo].[FOWPlumbing]
            SET IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE IdJob_HW = %s
              AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[FOWPlumbing] (
                IdJob_HW,
                itemName,
                code,
                description,
                qty,
                note,
                UserUpdate,
                DatetimeUpdate,
                IsOldData
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, GETDATE(), 0
            );
        """

        saved_jobs = []
        for job in payload.jobs:
            job_hw_id = _resolve_fow_plumbing_job(cursor, job.id_job_hw)

            # 1. Archive bản ghi cũ
            cursor.execute(sql_archive_old, (user_update, job_hw_id))

            # 2. Thêm mới
            items = job.items if job.items is not None else job.plumbing_items
            inserted_count = 0
            if items:
                for item in items:
                    name_val = str(item.item_name or item.itemName or "").strip()
                    code_val = str(item.code or "").strip() or None
                    desc_val = str(item.description or "").strip() or None
                    note_val = str(item.note or "").strip() or None
                    qty_val = _parse_decimal(item.qty, default=1.0)

                    # Bỏ qua dòng trống hoàn toàn
                    if not name_val and not code_val and not desc_val:
                        continue

                    cursor.execute(sql_insert_new, (
                        job_hw_id,
                        name_val,
                        code_val,
                        desc_val,
                        qty_val,
                        note_val,
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
            "message": f"Đã lưu thành công {len(saved_jobs)} FOW Plumbing job(s).",
            "saved_jobs": saved_jobs,
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Lỗi khi lưu FOW Plumbing jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error khi lưu FOW Plumbing: {str(e)}")
    finally:
        if conn:
            conn.close()
