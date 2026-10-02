

import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from api.unit_scope import get_active_unit, unit_filter, unit_value_sql

logger = logging.getLogger("ezefloor.fixout")

router = APIRouter(prefix="/api/fixout", tags=["Fixout-router"])


def _parse_decimal(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Chuyển đổi an toàn chuỗi (VD: '4.5mm', '6 mm', 4.5) sang số float/decimal cho MSSQL."""
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

class FixoutItemSchema(BaseModel):
    category: Optional[str] = Field(None, description="Danh mục (VD: Internal, External)")
    door_label: Optional[str] = Field(None, description="Nhãn cửa")
    door_type: Optional[str] = Field(None, description="Loại cửa")
    height: Optional[Union[float, int, str]] = Field(None, description="Chiều cao")
    width: Optional[Union[float, int, str]] = Field(None, description="Chiều rộng")
    thicks: Optional[Union[float, int, str]] = Field(None, description="Độ dày")
    wall_width: Optional[Union[float, int, str]] = Field(None, description="Chiều rộng tường")
    door_frame: Optional[str] = Field(None, description="Khung cửa")
    lift_off_pivot: Optional[str] = Field(None, description="Bản lề pivot")
    handing: Optional[str] = Field(None, description="Chiều mở cửa (L/R)")
    hole: Optional[str] = Field(None, description="Lỗ cửa")
    finish: Optional[str] = Field(None, description="Hoàn thiện bề mặt")
    door_furniture: Optional[str] = Field(None, description="Phụ kiện cửa")
    door_stop: Optional[str] = Field(None, description="Chặn cửa")
    qty: Optional[Union[float, int, str]] = Field(None, description="Số lượng")
    floor_level: Optional[str] = Field("GF", description="Tầng / Floor level (GF, FF, SF...)")
    floorLevel: Optional[str] = Field(None, description="Alias Floor level")


class FixoutJobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id)")
    fixout_items: List[FixoutItemSchema] = Field(
        ...,
        min_length=1,
        description="Danh sách các dòng Fixout cho mỗi Job",
    )


class SaveFixoutPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[FixoutJobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu Fixout")


# ══════════════════════════════════════════════════════
# HELPER: Resolve id_job_hw từ MSSQL
# ══════════════════════════════════════════════════════

def _resolve_fixout_job(cursor: Any, input_job_id: str) -> str:
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
            logger.warning(f"Fixout lookup attempt failed: {e}")

    # Fallback cho testing / standalone plan mà chưa có HW ID
    return raw_id


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC FIXOUT HIỆN TẠI (GET /api/fixout/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_fixout_jobs(
    request: Request,
    id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw"),
    office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"),
):
    """
    Truy vấn danh sách Fixout jobs từ MSSQL [ProcurementApp].[dbo].[Fixout].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(f.IsOldData, 0) = 0.
    """
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        normalized_hw_id = (id_job_hw or "").strip() or None

        sql = f"""
            SELECT
                f.ID AS fixout_id,
                f.IdJob_HW,
                f.category,
                f.door_label,
                f.door_type,
                f.height,
                f.width,
                f.thicks,
                f.wall_width,
                f.door_frame,
                f.lift_off_pivot,
                f.handing,
                f.hole,
                f.finish,
                f.door_furniture,
                f.door_stop,
                f.qty,
                f.FloorLevel AS floor_level,
                f.UserUpdate AS user_update,
                f.DatetimeUpdate AS datetime_update,
                f.IsOldData AS is_old_data,

                tghw.id AS hw_id,
                tghw.id_job_ems,

                lj.JobNumber AS job_number

            FROM [ProcurementApp].[dbo].[Fixout] f

            LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw
                ON tghw.id = f.IdJob_HW
               AND ISNULL(tghw.is_delete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(f.IsOldData, 0) = 0
                {unit_filter("f", active_unit)}
                AND (%s IS NULL OR CAST(f.IdJob_HW AS nvarchar(100)) = %s OR CAST(tghw.id AS nvarchar(100)) = %s OR CAST(lj.JobNumber AS nvarchar(100)) = %s)
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s OR UPPER(LTRIM(RTRIM(f.UserUpdate))) = %s)

            ORDER BY f.DatetimeUpdate DESC, f.ID;
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
            item["floor_level"] = str(row.get("floor_level") or "GF").strip()
            item["floorLevel"] = item["floor_level"]
            result.append(item)

        return {
            "success": True,
            "total": len(result),
            "data": result
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn Fixout jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Fixout: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU FIXOUT TRANSACTION & VERSIONING (POST /api/fixout/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_fixout_jobs(request: Request, payload: SaveFixoutPayloadSchema):
    """
    Lưu dữ liệu Fixout theo đúng chuẩn Versioning & Transaction:
    1. Validate toàn bộ Payload (id_job_hw, user_update).
    2. Ánh xạ chính xác id_job_hw sang tghw.id.
    3. Trong 1 Transaction:
       a) Chuyển record cũ của Job về IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    4. Nếu lỗi -> ROLLBACK toàn bộ.
    """
    user_update = payload.user_update.strip()
    if not user_update:
        raise HTTPException(status_code=422, detail="user_update là bắt buộc")

    # ── VALIDATION: Kiểm tra trùng lặp Job trong payload ──
    input_job_ids: set[str] = set()
    for job in payload.jobs:
        input_job_id = job.id_job_hw.strip()
        if not input_job_id:
            raise HTTPException(status_code=422, detail="id_job_hw là bắt buộc cho tất cả các Job")
        normalized_id = input_job_id.lower()
        if normalized_id in input_job_ids:
            raise HTTPException(status_code=422, detail=f"Job '{input_job_id}' appears more than once in the payload.")
        input_job_ids.add(normalized_id)

    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)  # Bật chế độ Transaction thủ công
        cursor = conn.cursor()

        saved_summary = []

        for job in payload.jobs:
            input_job_id = job.id_job_hw.strip()
            job_hw_id = _resolve_fixout_job(cursor, input_job_id)

            # Range-lock this job so concurrent requests cannot both create current rows
            cursor.execute("""
                SELECT ID
                FROM [ProcurementApp].[dbo].[Fixout] WITH (UPDLOCK, HOLDLOCK)
                WHERE IdJob_HW = %s;
            """, (job_hw_id,))
            cursor.fetchall()

            # Step 1: Đánh dấu tất cả record hiện tại thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = f"""
                UPDATE [ProcurementApp].[dbo].[Fixout]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IdJob_HW = %s
                {unit_filter(None, active_unit)}
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id))

            # Step 2: INSERT tất cả Fixout items mới
            sql_insert = f"""
                INSERT INTO [ProcurementApp].[dbo].[Fixout]
                (
                unit,
                    ID,
                    IdJob_HW,
                    category,
                    door_label,
                    door_type,
                    height,
                    width,
                    thicks,
                    wall_width,
                    door_frame,
                    lift_off_pivot,
                    handing,
                    hole,
                    finish,
                    door_furniture,
                    door_stop,
                    qty,
                    UserUpdate,
                    DatetimeUpdate,
                    IsOldData,
                    FloorLevel
                )
                VALUES
                (
                {unit_value_sql(active_unit)},
                    NEWID(),
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    GETDATE(),
                    0,
                    %s
                );
            """

            inserted_count = 0
            for item in job.fixout_items:
                height_val = _parse_decimal(item.height)
                width_val = _parse_decimal(item.width)
                thicks_val = _parse_decimal(item.thicks)
                wall_width_val = _parse_decimal(item.wall_width)
                qty_val = _parse_decimal(item.qty)
                fl_val = str(item.floor_level or item.floorLevel or "GF").strip() or "GF"

                cursor.execute(
                    sql_insert,
                    (
                        job_hw_id,
                        (item.category or "").strip() or None,
                        (item.door_label or "").strip() or None,
                        (item.door_type or "").strip() or None,
                        height_val,
                        width_val,
                        thicks_val,
                        wall_width_val,
                        (item.door_frame or "").strip() or None,
                        (item.lift_off_pivot or "").strip() or None,
                        (item.handing or "").strip() or None,
                        (item.hole or "").strip() or None,
                        (item.finish or "").strip() or None,
                        (item.door_furniture or "").strip() or None,
                        (item.door_stop or "").strip() or None,
                        qty_val,
                        user_update,
                        fl_val,
                    ),
                )
                inserted_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "fixout_inserted": inserted_count,
            })

        # Commit Transaction khi tất cả thành công!
        conn.commit()
        logger.info(f"Save Fixout Jobs thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Fixout Job(s) vào MSSQL [ProcurementApp].[dbo].[Fixout].",
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
                logger.warning("Đã Rollback Transaction Fixout SaveJobs do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu Fixout SaveJobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL Fixout: {str(e)}")

    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. BACKWARD COMPATIBILITY SAVE ENDPOINT (PUT & POST /api/fixout/save)
# ══════════════════════════════════════════════════════

@router.post("/save")
@router.put("/save")
async def save_fixout_single(payload: dict, request: Request):
    """
    Endpoint lưu đơn lẻ 1 dòng Fixout (POST / PUT /api/fixout/save).
    Tự động chuyển đổi payload đơn lẻ sang quy trình Transaction & Versioning /api/fixout/save-jobs.
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id") or payload.get("IdJob_HW")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    user_update = payload.get("user_update") or request.headers.get("x-username")
    if not user_update or not str(user_update).strip():
        raise HTTPException(status_code=422, detail="Missing required field: user_update")

    # Nếu payload chứa mảng "items", dùng mảng đó. Ngược lại coi payload là 1 item.
    raw_items = payload.get("items") or payload.get("fixout_items")
    if raw_items and isinstance(raw_items, list):
        fixout_items = [
            FixoutItemSchema(
                category=it.get("category"),
                door_label=it.get("door_label"),
                door_type=it.get("door_type"),
                height=it.get("height"),
                width=it.get("width"),
                thicks=it.get("thicks"),
                wall_width=it.get("wall_width"),
                door_frame=it.get("door_frame"),
                lift_off_pivot=it.get("lift_off_pivot"),
                handing=it.get("handing"),
                hole=it.get("hole"),
                finish=it.get("finish"),
                door_furniture=it.get("door_furniture"),
                door_stop=it.get("door_stop"),
                qty=it.get("qty"),
                floor_level=it.get("floor_level") or it.get("floorLevel") or it.get("FloorLevel") or "GF",
            )
            for it in raw_items
        ]
    else:
        fixout_items = [
            FixoutItemSchema(
                category=payload.get("category"),
                door_label=payload.get("door_label"),
                door_type=payload.get("door_type"),
                height=payload.get("height"),
                width=payload.get("width"),
                thicks=payload.get("thicks"),
                wall_width=payload.get("wall_width"),
                door_frame=payload.get("door_frame"),
                lift_off_pivot=payload.get("lift_off_pivot"),
                handing=payload.get("handing"),
                hole=payload.get("hole"),
                finish=payload.get("finish"),
                door_furniture=payload.get("door_furniture"),
                door_stop=payload.get("door_stop"),
                qty=payload.get("qty"),
                floor_level=payload.get("floor_level") or payload.get("floorLevel") or payload.get("FloorLevel") or "GF",
            )
        ]

    formatted_payload = SaveFixoutPayloadSchema(
        user_update=user_update,
        jobs=[
            FixoutJobSaveSchema(
                id_job_hw=id_job_hw,
                fixout_items=fixout_items,
            )
        ],
    )

    return await save_fixout_jobs(formatted_payload)


# ══════════════════════════════════════════════════════
# 4. XÓA 1 DÒNG FIXOUT (DELETE /api/fixout/{fixout_id})
# ══════════════════════════════════════════════════════

@router.delete("/{fixout_id}")
async def delete_fixout_row(fixout_id: str, request: Request):
    """
    Xóa mềm 1 dòng Fixout (đánh dấu IsOldData = 1).
    """
    user_update = request.headers.get("x-username", "system")

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE [ProcurementApp].[dbo].[Fixout]
            SET IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE CAST(ID AS nvarchar(100)) = %s
              AND ISNULL(IsOldData, 0) = 0;
        """, (user_update, fixout_id.strip()))

        conn.commit()

        return {
            "success": True,
            "message": f"Đã xóa Fixout row ID={fixout_id}.",
        }

    except Exception as e:
        logger.error(f"Lỗi xóa Fixout row: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi xóa Fixout: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 5. HEALTH CHECK (GET /api/fixout/health)
# ══════════════════════════════════════════════════════

@router.get("/health")
async def fixout_health_check():
    """Kiểm tra kết nối đến MSSQL [ProcurementApp].[dbo].[Fixout]."""
    from app.mssql_db import test_mssql_connection
    ok = test_mssql_connection()
    if ok:
        return {"status": "ok", "message": "MSSQL Fixout connection successful"}
    else:
        raise HTTPException(status_code=503, detail="Cannot connect to MSSQL Fixout")
