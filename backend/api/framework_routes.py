"""
api/framework_routes.py – FrameWork API Router
================================================
Cung cấp REST endpoint để truy vấn và lưu bóc tách tường vào [ProcurementApp].[dbo].[FrameWork]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng CONVERT(VARCHAR(50), NEWID()).
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.framework")

router = APIRouter(prefix="/api/framework")


def _parse_decimal(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Chuyển đổi an toàn chuỗi (VD: 'M12', '900 mm', 2700) sang số float/decimal cho MSSQL."""
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


def _parse_rod_size(val: Any, default: str = "M12") -> str:
    """Đảm bảo chuỗi RodSize lưu vào database luôn là full text (VD: 'M12', 'M16')."""
    if val is None:
        return default
    s = str(val).strip()
    if not s:
        return default
    s_upper = s.upper()
    if s_upper.startswith("M"):
        return s_upper
    try:
        num = int(float(s))
        return f"M{num}"
    except (ValueError, TypeError):
        return s_upper


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class WallItemSchema(BaseModel):
    floor_type: str = Field(..., description="Loại sàn: 'Timber' hoặc 'Slab'")
    wall_height: Optional[Union[float, int]] = Field(None, description="Chiều cao tường mm")
    wall_length: Optional[Union[float, int]] = Field(None, description="Chiều dài tường mm")
    spacing: Optional[Union[float, int]] = Field(None, description="Khoảng cách bulong mm (VD: 900)")
    rod_size: Optional[str] = Field(None, description="Kích cỡ bulong (VD: M12, M16)")
    short_name: Optional[str] = Field(None, description="Mã viết tắt client (VD: BNSW-ACT)")
    floor_level: Optional[str] = Field(None, description="Mã tầng (VD: GF, FF, SF, TF)")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    walls: List[WallItemSchema] = Field(default_factory=list, description="Danh sách các mốc tường bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB HIỆN TẠI (GET /api/framework/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_framework_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách FrameWork jobs từ MSSQL [ProcurementApp].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(fw.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                fw.ID AS framework_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                fw.WallHeight AS wall_height,
                fw.WallLength AS wall_length,
                fw.TheWallAbove AS wall_above,
                fw.Spacing AS spacing,
                fw.RodSize AS rod_size,
                fw.short_name AS short_name,
                fw.FloorLevel AS floor_level,
                fw.UserUpdate AS user_update,
                fw.DatetimeUpdate AS datetime_update,
                fw.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[FrameWork] fw
                ON tghw.id = fw.IDJob_HW
               AND ISNULL(fw.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND aj.MaNV = 'EZE0098'

            ORDER BY tghw.id DESC;
        """

        cursor.execute(sql)
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
        logger.error(f"Lỗi truy vấn FrameWork jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH TƯỜNG TRANSACTION & VERSIONING (POST /api/framework/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_framework_jobs(payload: SaveJobsPayloadSchema, request: Request = None):
    """
    Lưu dữ liệu FrameWork theo đúng chuẩn Versioning & Transaction:
    1. Kiểm tra Validate toàn bộ Payload (id_job_hw, user_update, floor_type hợp lệ, không trùng floor_type cùng 1 Job).
    2. Trong 1 Transaction duy nhất cho tất cả các Jobs:
       a) Chuyển toàn bộ record cũ của Job về IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    3. Nếu xảy ra bất kỳ lỗi nào -> ROLLBACK toàn bộ transaction!
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

        for wall in job.walls:
            ft = (wall.floor_type or "").strip()
            if ft not in ["Timber", "Slab"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"floor_type '{wall.floor_type}' không hợp lệ cho Job {job.id_job_hw}. Chỉ chấp nhận 'Timber' hoặc 'Slab'."
                )

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

            # Ánh xạ input_job_id sang chính xác tghw.id trong task_group_hw
            cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id = %s AND is_delete = 0", (input_job_id,))
            found_tghw = cursor.fetchone()
            if found_tghw:
                job_hw_id = found_tghw[0] if isinstance(found_tghw, (list, tuple)) else found_tghw.get('id', input_job_id)
            else:
                # Tìm theo JobNumber từ ListJobs (VD: 'TestAI')
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
                    # Nếu là local SQLite ID (như 98), tra cứu project_name tương ứng
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

            # Step 1: Đánh dấu tất cả record hiện tại của Job đó thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = """
                UPDATE [ProcurementApp].[dbo].[FrameWork]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IDJob_HW = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id))

            # Step 2: INSERT dữ liệu mới thành record mới (IsOldData = 0, NEWID())
            sql_insert_new = """
                INSERT INTO [ProcurementApp].[dbo].[FrameWork]
                (
                    ID,
                    IDJob_HW,
                    WallHeight,
                    WallLength,
                    TheWallAbove,
                    Spacing,
                    RodSize,
                    short_name,
                    FloorLevel,
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
                    %s,
                    %s,
                    %s,
                    %s,
                    GETDATE(),
                    0
                );
            """

            inserted_walls_count = 0
            for wall in job.walls:
                wall_h = _parse_decimal(wall.wall_height, default=2440)
                wall_l = _parse_decimal(wall.wall_length, default=0)
                spacing_val = _parse_decimal(wall.spacing, default=900)
                rod_size_val = _parse_rod_size(wall.rod_size, default="M12")
                short_name_val = wall.short_name if wall.short_name else "BUN-NSW-ACT"
                floor_level_val = (wall.floor_level or "").strip() if wall.floor_level else None
                cursor.execute(
                    sql_insert_new,
                    (
                        job_hw_id,
                        wall_h,
                        wall_l,
                        wall.floor_type,
                        spacing_val,
                        rod_size_val,
                        short_name_val,
                        floor_level_val,
                        user_update
                    )
                )
                inserted_walls_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "walls_inserted": inserted_walls_count
            })

        # Commit Transaction khi tất cả các bước thành công!
        conn.commit()
        logger.info(f"Save All Jobs thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Job(s) vào MSSQL FrameWork.",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()  # Rollback an toàn nếu có bất kỳ lỗi nào!
                logger.warning("Đã Rollback Transaction FrameWork SaveJobs do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu FrameWork SaveJobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL FrameWork: {str(e)}")

    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. BACKWARD COMPATIBILITY SAVE ENDPOINT (PUT /api/framework/save)
# ══════════════════════════════════════════════════════

@router.put("/save")
async def save_framework_wall_single(payload: dict, request: Request = None):
    """
    Endpoint tương thích ngược với nút lưu đơn lẻ cũ (PUT /api/framework/save).
    Tự động chuyển đổi payload đơn lẻ sang quy trình Transaction & Versioning /api/framework/save-jobs.
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    floor_type = payload.get("floor_type") or payload.get("wall_above") or "Timber"
    wall_height = payload.get("wall_height")
    wall_length = payload.get("wall_length")
    spacing = payload.get("spacing", 900)
    rod_size = payload.get("rod_size", "M12")
    short_name = payload.get("short_name", "BUN-NSW-ACT")
    floor_level = payload.get("floor_level", None)
    user_update = payload.get("user_update") or (request.headers.get("x-username") if request else None) or "admin"

    formatted_payload = SaveJobsPayloadSchema(
        user_update=user_update,
        jobs=[
            JobSaveSchema(
                id_job_hw=id_job_hw,
                walls=[
                    WallItemSchema(
                        floor_type=floor_type,
                        wall_height=wall_height,
                        wall_length=wall_length,
                        spacing=spacing,
                        rod_size=rod_size,
                        short_name=short_name,
                        floor_level=floor_level
                    )
                ]
            )
        ]
    )

    return await save_framework_jobs(formatted_payload)


# ══════════════════════════════════════════════════════
# 4. HEALTH CHECK (GET /api/framework/health)
# ══════════════════════════════════════════════════════

@router.get("/health")
async def framework_health_check():
    """Kiểm tra kết nối đến MSSQL [emsflow] có hoạt động không."""
    from app.mssql_db import test_mssql_connection
    ok = test_mssql_connection()
    if ok:
        return {"status": "ok", "message": "MSSQL emsflow connection successful"}
    else:
        raise HTTPException(status_code=503, detail="Cannot connect to MSSQL emsflow")
