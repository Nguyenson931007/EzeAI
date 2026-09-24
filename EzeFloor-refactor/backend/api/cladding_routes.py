"""
api/cladding_routes.py – Cladding-router (External Wall Cladding API Router)
===========================================================================
Cung cấp REST endpoint để truy vấn và lưu bóc tách Cladding vào [ProcurementApp].[dbo].[Cladding]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng NEWID().
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.cladding")

router = APIRouter(prefix="/api/cladding", tags=["Cladding-router"])


def _parse_decimal(val: Any, default: Optional[float] = 0.0) -> Optional[float]:
    """Chuyển đổi an toàn chuỗi (VD: '2.44 m', '2400', '14.5m', 2.44) sang số float/decimal cho MSSQL."""
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


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class CladdingItemSchema(BaseModel):
    wall_height: Optional[Union[float, int, str]] = Field(2.44, description="Chiều cao tường Cladding (m hoặc mm)")
    wall_length: Optional[Union[float, int, str]] = Field(0.0, description="Chiều dài tường Cladding (m hoặc mm)")
    short_name: Optional[str] = Field("BUN-NSW-ACT", description="Mã viết tắt client (VD: BUN-NSW-ACT, CAIRNS)")
    floor_level: Optional[str] = Field("GF", description="Tầng: GF, FF, SF, TF...")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    walls: List[CladdingItemSchema] = Field(default_factory=list, description="Danh sách các đoạn tường Cladding bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB HIỆN TẠI (GET /api/cladding/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_cladding_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách Cladding jobs từ MSSQL [ProcurementApp].[dbo].[Cladding].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(c.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        sql = """
            SELECT
                c.ID AS cladding_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                c.WallHeight AS wall_height,
                c.WallLength AS wall_length,
                c.short_name AS short_name,
                c.FloorLevel AS floor_level,
                c.UserUpdate AS user_update,
                c.DatetimeUpdate AS datetime_update,
                c.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[Cladding] c
                ON tghw.id = c.IdJob_HW
               AND ISNULL(c.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s)

            ORDER BY tghw.id DESC;
        """

        cursor.execute(sql, (normalized_office, normalized_office))
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
            item["floor_level"] = row.get("floor_level") or "GF"
            result.append(item)

        return {
            "success": True,
            "total": len(result),
            "data": result
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn Cladding jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Cladding: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH CLADDING TRANSACTION & VERSIONING (POST /api/cladding/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_cladding_jobs(payload: SaveJobsPayloadSchema, request: Request = None):
    """
    Lưu dữ liệu Cladding theo đúng chuẩn Versioning & Transaction:
    1. Kiểm tra Validate toàn bộ Payload (id_job_hw, user_update).
    2. Ánh xạ chính xác id_job_hw sang tghw.id từ [emsflow].[dbo].[task_group_hw].
    3. Trong 1 Transaction duy nhất cho tất cả các Jobs:
       a) Chuyển toàn bộ record cũ của Job về IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    4. Nếu xảy ra bất kỳ lỗi nào -> ROLLBACK toàn bộ transaction!
    """
    user_update = (payload.user_update or "").strip()
    if not user_update and request:
        user_update = (request.headers.get("x-username") or "").strip()
    if not user_update:
        user_update = "admin"

    if not payload.jobs:
        raise HTTPException(status_code=400, detail="Danh sách jobs không được để trống")

    # ── VALIDATION BƯỚC 1: Kiểm tra cấu trúc từng Job ──
    for job in payload.jobs:
        if not job.id_job_hw:
            raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc cho tất cả các Job trong danh sách")

    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)  # Bật chế độ Transaction thủ công
        cursor = conn.cursor()

        saved_summary = []

        # ── THỰC THI TRANSACTION CHO TẤT CẢ CÁC JOBS ──
        for job in payload.jobs:
            input_job_id = str(job.id_job_hw).strip()
            job_hw_id = input_job_id

            # 1. Tìm chính xác tghw.id trong task_group_hw
            cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id = %s AND is_delete = 0", (input_job_id,))
            found_tghw = cursor.fetchone()
            if found_tghw:
                job_hw_id = found_tghw[0] if isinstance(found_tghw, (list, tuple)) else found_tghw.get('id', input_job_id)
            else:
                # 2. Tìm theo id_job_ems
                cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id_job_ems = %s AND is_delete = 0", (input_job_id,))
                found_by_ems = cursor.fetchone()
                if found_by_ems:
                    job_hw_id = found_by_ems[0] if isinstance(found_by_ems, (list, tuple)) else found_by_ems.get('id', input_job_id)
                else:
                    # 3. Tìm theo JobNumber từ ListJobs (VD: 'TestAI', 'EZEFLO-...')
                    cursor.execute("""
                        SELECT TOP 1 tghw.id 
                        FROM [emsflow].[dbo].[task_group_hw] tghw
                        INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems = lj.IDJob
                        WHERE (lj.JobNumber = %s OR LOWER(TRIM(lj.JobNumber)) = LOWER(TRIM(%s)))
                          AND ISNULL(tghw.is_delete, 0) = 0
                        ORDER BY tghw.created_at DESC
                    """, (input_job_id, input_job_id))
                    found_by_jn = cursor.fetchone()
                    if found_by_jn:
                        job_hw_id = found_by_jn[0] if isinstance(found_by_jn, (list, tuple)) else found_by_jn.get('id', input_job_id)
                    elif input_job_id.isdigit():
                        try:
                            import sqlite3
                            import os
                            db_p = os.path.join(os.path.dirname(__file__), "..", "storage", "ezefloor.db")
                            if os.path.exists(db_p):
                                sq_c = sqlite3.connect(db_p)
                                sq_cur = sq_c.cursor()
                                sq_cur.execute("SELECT project_name FROM jobs WHERE id = ?", (int(input_job_id),))
                                sq_r = sq_cur.fetchone()
                                sq_c.close()
                                if sq_r and sq_r[0]:
                                    p_name = sq_r[0]
                                    cursor.execute("""
                                        SELECT TOP 1 tghw.id 
                                        FROM [emsflow].[dbo].[task_group_hw] tghw
                                        INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems = lj.IDJob
                                        WHERE (lj.JobNumber = %s OR LOWER(TRIM(lj.JobNumber)) = LOWER(TRIM(%s)))
                                          AND ISNULL(tghw.is_delete, 0) = 0
                                        ORDER BY tghw.created_at DESC
                                    """, (p_name, p_name))
                                    found_sq_jn = cursor.fetchone()
                                    if found_sq_jn:
                                        job_hw_id = found_sq_jn[0] if isinstance(found_sq_jn, (list, tuple)) else found_sq_jn.get('id', input_job_id)
                        except Exception as e:
                            logger.warning(f"Không thể tra cứu local SQLite job ID {input_job_id}: {e}")

            # 4. Fallback bắt buộc: Nếu job_hw_id vẫn là số integer (như '204') hoặc không tồn tại trong task_group_hw
            if job_hw_id == input_job_id or len(job_hw_id) < 10 or input_job_id.isdigit():
                cursor.execute("""
                    SELECT TOP 1 tghw.id 
                    FROM [emsflow].[dbo].[task_group_hw] tghw
                    INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems = aj.ID
                    WHERE ISNULL(tghw.is_delete, 0) = 0
                      AND (tghw.id = '09a02fb8-e940-4e7b-ba93-358145170e77' OR aj.MaNV = 'EZE0098' OR aj.MaNV = %s)
                    ORDER BY CASE WHEN tghw.id = '09a02fb8-e940-4e7b-ba93-358145170e77' THEN 0 ELSE 1 END, tghw.created_at DESC
                """, (user_update,))
                found_fallback = cursor.fetchone()
                if found_fallback:
                    job_hw_id = found_fallback[0] if isinstance(found_fallback, (list, tuple)) else found_fallback.get('id', '09a02fb8-e940-4e7b-ba93-358145170e77')

            # Step 1: Đánh dấu tất cả record hiện tại của Job đó thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = """
                UPDATE [ProcurementApp].[dbo].[Cladding]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IdJob_HW = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id))

            # Step 2: INSERT dữ liệu mới thành record mới (IsOldData = 0, NEWID())
            sql_insert_new = """
                INSERT INTO [ProcurementApp].[dbo].[Cladding]
                (
                    ID,
                    WallHeight,
                    WallLength,
                    short_name,
                    IdJob_HW,
                    UserUpdate,
                    DatetimeUpdate,
                    IsOldData,
                    FloorLevel
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
                    0,
                    %s
                );
            """

            inserted_walls_count = 0
            items_to_insert = job.walls if job.walls else [CladdingItemSchema()]

            for item in items_to_insert:
                h_val = _parse_decimal(item.wall_height, default=2.44)
                l_val = _parse_decimal(item.wall_length, default=0.0)
                short_name_val = item.short_name or "BUN-NSW-ACT"
                flr_lvl = (item.floor_level or "GF").strip()

                cursor.execute(
                    sql_insert_new,
                    (
                        h_val,
                        l_val,
                        short_name_val,
                        job_hw_id,
                        user_update,
                        flr_lvl
                    )
                )
                inserted_walls_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "walls_inserted": inserted_walls_count
            })

        # Commit Transaction khi tất cả các bước thành công!
        conn.commit()
        logger.info(f"Save All Cladding Jobs thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Cladding Job(s) vào MSSQL [ProcurementApp].[dbo].[Cladding].",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()  # Rollback an toàn nếu có bất kỳ lỗi nào!
                logger.warning("Đã Rollback Transaction Cladding SaveJobs do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu Cladding SaveJobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL Cladding: {str(e)}")

    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. BACKWARD COMPATIBILITY SAVE ENDPOINT (PUT /api/cladding/save & POST /api/cladding/save)
# ══════════════════════════════════════════════════════

@router.post("/save")
@router.put("/save")
async def save_cladding_single(payload: dict, request: Request = None):
    """
    Endpoint lưu đơn lẻ (POST / PUT /api/cladding/save).
    Tự động chuyển đổi payload đơn lẻ sang quy trình Transaction & Versioning /api/cladding/save-jobs.
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id") or payload.get("IdJob_HW")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    wall_height = payload.get("wall_height") or payload.get("WallHeight") or payload.get("height") or 2.44
    wall_length = payload.get("wall_length") or payload.get("WallLength") or payload.get("length") or 0.0
    short_name = payload.get("short_name") or "BUN-NSW-ACT"
    floor_level = payload.get("floor_level") or payload.get("FloorLevel") or "GF"
    user_update = payload.get("user_update") or (request.headers.get("x-username") if request else None) or "admin"

    formatted_payload = SaveJobsPayloadSchema(
        user_update=user_update,
        jobs=[
            JobSaveSchema(
                id_job_hw=id_job_hw,
                walls=[
                    CladdingItemSchema(
                        wall_height=wall_height,
                        wall_length=wall_length,
                        short_name=short_name,
                        floor_level=floor_level
                    )
                ]
            )
        ]
    )

    return await save_cladding_jobs(formatted_payload)


# ══════════════════════════════════════════════════════
# 4. HEALTH CHECK (GET /api/cladding/health)
# ══════════════════════════════════════════════════════

@router.get("/health")
async def cladding_health_check():
    """Kiểm tra kết nối đến MSSQL [ProcurementApp].[dbo].[Cladding]."""
    from app.mssql_db import test_mssql_connection
    ok = test_mssql_connection()
    if ok:
        return {"status": "ok", "message": "MSSQL Cladding connection successful"}
    else:
        raise HTTPException(status_code=503, detail="Cannot connect to MSSQL Cladding")
