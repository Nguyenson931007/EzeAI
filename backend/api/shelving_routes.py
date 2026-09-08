import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.shelving")

router = APIRouter(prefix="/api/shelving", tags=["Shelving-router"])


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

class ShelvingItemSchema(BaseModel):
    type: Optional[str] = Field(None, description="Loại Shelving (VD: Robe, Linen)")
    size: Optional[str] = Field(None, description="Kích thước (VD: 1500×450, 1800×450)")
    qty: Optional[Union[float, int, str]] = Field(None, description="Số lượng")


class ShelvingJobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id)")
    items: Optional[List[ShelvingItemSchema]] = Field(
        None,
        description="Danh sách các dòng Shelving cho mỗi Job",
    )
    shelving_items: Optional[List[ShelvingItemSchema]] = Field(
        None,
        description="Alias cho danh sách các dòng Shelving",
    )


class SaveShelvingPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[ShelvingJobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu Shelving")


# ══════════════════════════════════════════════════════
# HELPER: Resolve id_job_hw từ MSSQL
# ══════════════════════════════════════════════════════

def _resolve_shelving_job(cursor: Any, input_job_id: str) -> str:
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
            logger.warning(f"Shelving lookup attempt failed: {e}")

    # Fallback cho testing / standalone plan
    return raw_id


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC SHELVING HIỆN TẠI (GET /api/shelving/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_shelving_jobs(
    id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw or job_number"),
    office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"),
):
    """
    Truy vấn danh sách Shelving jobs từ MSSQL [ProcurementApp].[dbo].[Shelving].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(s.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        normalized_hw_id = (id_job_hw or "").strip() or None

        sql = """
            SELECT
                s.ID AS shelving_id,
                s.IdJob_HW,
                s.Type AS type,
                s.Size AS size,
                s.Qty AS qty,
                s.UserUpdate AS user_update,
                s.DatetimeUpdate AS datetime_update,
                s.IsOldData AS is_old_data,

                tghw.id AS hw_id,
                tghw.id_job_ems,

                lj.JobNumber AS job_number

            FROM [ProcurementApp].[dbo].[Shelving] s

            LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw
                ON tghw.id = s.IdJob_HW
               AND ISNULL(tghw.is_delete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(s.IsOldData, 0) = 0
                AND (%s IS NULL OR CAST(s.IdJob_HW AS nvarchar(100)) = %s OR CAST(tghw.id AS nvarchar(100)) = %s OR CAST(lj.JobNumber AS nvarchar(100)) = %s)
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s OR UPPER(LTRIM(RTRIM(s.UserUpdate))) = %s)

            ORDER BY s.DatetimeUpdate DESC, s.ID;
        """

        cursor.execute(sql, (
            normalized_hw_id, normalized_hw_id, normalized_hw_id, normalized_hw_id,
            normalized_office, normalized_office, normalized_office
        ))
        rows = cursor.fetchall()

        result = []
        for row in rows:
            item = {}
            for key, val in row.items():
                if val is None:
                    item[key] = None
                elif isinstance(val, (int, float, str, bool)):
                    item[key] = val
                else:
                    item[key] = str(val)
            result.append(item)

        return {
            "success": True,
            "total": len(result),
            "data": result
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn Shelving jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Shelving: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU SHELVING TRANSACTION & VERSIONING (POST /api/shelving/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_shelving_jobs(payload: SaveShelvingPayloadSchema):
    """
    Lưu dữ liệu Shelving theo Versioning & Transaction:
    1. Validate Payload (id_job_hw, user_update).
    2. Ánh xạ id_job_hw sang tghw.id (hoặc fallback nếu là standalone test).
    3. Transaction:
       a) Update record cũ sang IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    """
    user_update = payload.user_update.strip()
    if not user_update:
        raise HTTPException(status_code=422, detail="user_update là bắt buộc")

    input_job_ids: set[str] = set()
    for job in payload.jobs:
        input_job_id = job.id_job_hw.strip()
        if not input_job_id:
            raise HTTPException(status_code=422, detail="id_job_hw là bắt buộc cho tất cả các Job")
        normalized_id = input_job_id.lower()
        if normalized_id in input_job_ids:
            raise HTTPException(status_code=422, detail=f"Job '{input_job_id}' appears more than once in the payload.")
        input_job_ids.add(normalized_id)

    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)
        cursor = conn.cursor()

        saved_summary = []

        for job in payload.jobs:
            input_job_id = job.id_job_hw.strip()
            job_hw_id = _resolve_shelving_job(cursor, input_job_id)

            # Step 1: Đánh dấu tất cả record hiện tại thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = """
                UPDATE [ProcurementApp].[dbo].[Shelving]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IdJob_HW = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id))

            # Step 2: INSERT tất cả Shelving items mới
            sql_insert = """
                INSERT INTO [ProcurementApp].[dbo].[Shelving]
                (
                    ID,
                    IdJob_HW,
                    [Type],
                    [Size],
                    [Qty],
                    UserUpdate,
                    DatetimeUpdate,
                    IsOldData
                )
                VALUES
                (
                    NEWID(),
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    GETDATE(),
                    0
                );
            """

            items_list = job.items or job.shelving_items or []
            inserted_count = 0
            for item in items_list:
                qty_val = _parse_decimal(item.qty, default=1.0)
                type_val = (item.type or "").strip() or None
                size_val = (item.size or "").strip() or None

                cursor.execute(
                    sql_insert,
                    (
                        job_hw_id,
                        type_val,
                        size_val,
                        qty_val,
                        user_update,
                    ),
                )
                inserted_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "shelving_inserted": inserted_count,
            })

        conn.commit()
        logger.info(f"Save Shelving Jobs thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Shelving Job(s) vào MSSQL [ProcurementApp].[dbo].[Shelving].",
            "user_update": user_update,
            "jobs_saved": saved_summary,
        }

    except HTTPException:
        if conn:
            try:
                conn.rollback()
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")
        raise
    except Exception as e:
        if conn:
            try:
                conn.rollback()
                logger.warning("Đã Rollback Transaction Shelving SaveJobs do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu Shelving SaveJobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL Shelving: {str(e)}")

    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. BACKWARD COMPATIBILITY SAVE ENDPOINT (POST & PUT /api/shelving/save)
# ══════════════════════════════════════════════════════

@router.post("/save")
@router.put("/save")
async def save_shelving_single(payload: dict, request: Request):
    """
    Endpoint lưu đơn lẻ 1 dòng Shelving (POST / PUT /api/shelving/save).
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id") or payload.get("IdJob_HW")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    user_update = payload.get("user_update") or request.headers.get("x-username") or "EZE0098"

    raw_items = payload.get("items") or payload.get("shelving_items")
    if raw_items and isinstance(raw_items, list):
        items = [
            ShelvingItemSchema(
                type=it.get("type") or it.get("Type"),
                size=it.get("size") or it.get("Size"),
                qty=it.get("qty") or it.get("Qty"),
            )
            for it in raw_items
        ]
    else:
        items = [
            ShelvingItemSchema(
                type=payload.get("type") or payload.get("Type"),
                size=payload.get("size") or payload.get("Size"),
                qty=payload.get("qty") or payload.get("Qty"),
            )
        ]

    job_schema = ShelvingJobSaveSchema(
        id_job_hw=str(id_job_hw),
        items=items,
    )
    save_payload = SaveShelvingPayloadSchema(
        user_update=str(user_update),
        jobs=[job_schema],
    )
    return await save_shelving_jobs(save_payload)
