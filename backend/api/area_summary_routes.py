"""
api/area_summary_routes.py – AreaSummary API Router
==================================================
Cung cấp REST endpoint để truy vấn và lưu tính diện tích phòng vào [ProcurementApp].[dbo].[AreaSummary]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng NEWID().
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.area_summary")

router = APIRouter(prefix="/api/area-summary")


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class AreaItemSchema(BaseModel):
    floor_level: Optional[str] = Field("GF", description="Tầng: GF, Level 1, Level 2, etc.")
    floor_area_type: Optional[str] = Field("Dry", description="Loại khu vực: Dry, Wet, Timber Deck, Tile Deck, etc.")
    net_area: Optional[Union[float, int]] = Field(0.0, description="Diện tích thực tế (m²)")
    product: Optional[str] = Field(None, description="Tên vật tư / sản phẩm sàn")
    short_name: Optional[str] = Field("BUN-NSW-ACT", description="Mã viết tắt client (VD: BUN-NSW-ACT)")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    areas: List[AreaItemSchema] = Field(default_factory=list, description="Danh sách các mục diện tích bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: Optional[str] = Field(None, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB AREA SUMMARY HIỆN TẠI (GET /api/area-summary/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_area_summary_jobs(office: Optional[str] = None):
    """
    Truy vấn danh sách AreaSummary jobs từ MSSQL [ProcurementApp].[dbo].[AreaSummary].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ars.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        office_condition = ""
        params = []
        if office:
            office_condition = "AND aj.MaNV = %s"
            params.append(office)
        else:
            office_condition = "AND aj.MaNV = 'EZE0098'"

        sql = f"""
            SELECT
                ars.ID AS area_summary_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                ars.FloorLevel AS floor_level,
                ars.FloorAreaType AS floor_area_type,
                ars.NetArea AS net_area,
                ars.Product AS product,
                ars.short_name AS short_name,
                ars.UserUpdate AS user_update,
                ars.DatetimeUpdate AS datetime_update,
                ars.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[AreaSummary] ars
                ON tghw.id = ars.IDJob_HW
               AND ISNULL(ars.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                {office_condition}

            ORDER BY tghw.id DESC, ars.ID DESC;
        """

        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()

        formatted_rows = []
        for r in rows:
            formatted_rows.append({
                "area_summary_id": str(r.get("area_summary_id")) if r.get("area_summary_id") else None,
                "IDJob_HW": str(r.get("IDJob_HW")) if r.get("IDJob_HW") else None,
                "hw_id": str(r.get("hw_id")) if r.get("hw_id") else None,
                "job_number": r.get("job_number"),
                "floor_level": r.get("floor_level"),
                "floor_area_type": r.get("floor_area_type"),
                "net_area": float(r["net_area"]) if r.get("net_area") is not None else 0.0,
                "product": r.get("product"),
                "short_name": r.get("short_name"),
                "user_update": r.get("user_update"),
                "datetime_update": r["datetime_update"].isoformat() if r.get("datetime_update") else None,
                "is_old_data": r.get("is_old_data", 0)
            })

        logger.info(f"Lấy thành công {len(formatted_rows)} bản ghi AreaSummary.")
        return {
            "success": True,
            "total": len(formatted_rows),
            "data": formatted_rows
        }

    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách AreaSummary Jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL AreaSummary: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH AREA SUMMARY VÀO MSSQL (POST /api/area-summary/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_area_summary_jobs(payload: SaveJobsPayloadSchema, request: Request = None):
    """
    Lưu danh sách bóc tách AreaSummary của nhiều Jobs vào MSSQL CSDL [ProcurementApp].[dbo].[AreaSummary].
    Thực hiện hoàn toàn trong DATABASE TRANSACTION với IsOldData versioning.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = (payload.user_update or "").strip()
        if not user_update and request:
            user_update = (request.headers.get("x-username") or "").strip()
        if not user_update:
            user_update = "admin"

        saved_summary = []

        sql_archive_old = """
            UPDATE [ProcurementApp].[dbo].[AreaSummary]
            SET
                IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE
                IDJob_HW = %s
                AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[AreaSummary]
            (
                ID,
                FloorLevel,
                FloorAreaType,
                NetArea,
                Product,
                short_name,
                IDJob_HW,
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
                GETDATE(),
                0
            );
        """

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            job_hw_id = raw_id

            # Ánh xạ input_job_id sang chính xác tghw.id trong task_group_hw (giống FrameWork)
            cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id = %s AND is_delete = 0", (raw_id,))
            found_tghw = cursor.fetchone()
            if found_tghw:
                job_hw_id = found_tghw[0] if isinstance(found_tghw, (list, tuple)) else found_tghw.get('id', raw_id)
            else:
                # Tìm theo JobNumber từ ListJobs (VD: 'TestAI')
                cursor.execute("""
                    SELECT TOP 1 tghw.id 
                    FROM [emsflow].[dbo].[task_group_hw] tghw
                    INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems = lj.IDJob
                    WHERE (lj.JobNumber = %s OR LOWER(TRIM(lj.JobNumber)) = LOWER(TRIM(%s)))
                      AND ISNULL(tghw.is_delete, 0) = 0
                    ORDER BY tghw.created_at DESC
                """, (raw_id, raw_id))
                found_by_jn = cursor.fetchone()
                if found_by_jn:
                    job_hw_id = found_by_jn[0] if isinstance(found_by_jn, (list, tuple)) else found_by_jn.get('id', raw_id)
                elif raw_id.isdigit():
                    # Nếu là local SQLite ID (như 98), tra cứu project_name tương ứng
                    try:
                        import sqlite3
                        import os
                        db_p = os.path.join(os.path.dirname(__file__), "..", "storage", "ezefloor.db")
                        if os.path.exists(db_p):
                            sq_c = sqlite3.connect(db_p)
                            sq_cur = sq_c.cursor()
                            sq_cur.execute("SELECT project_name FROM jobs WHERE id = ?", (int(raw_id),))
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
                                    job_hw_id = found_sq_jn[0] if isinstance(found_sq_jn, (list, tuple)) else found_sq_jn.get('id', raw_id)
                    except Exception as e:
                        logger.warning(f"Không thể tra cứu local SQLite job ID {raw_id}: {e}")

            # 1. Chuyển các bản ghi cũ của Job này thành IsOldData = 1
            cursor.execute(sql_archive_old, (user_update, job_hw_id))

            # 2. Thêm mới các mốc diện tích hiện tại (IsOldData = 0)
            inserted_count = 0
            for item in job.areas:
                net_val = float(item.net_area) if item.net_area is not None else 0.0
                short_name_val = (item.short_name or "").strip() or "BUN-NSW-ACT"
                prod_val = (item.product or "").strip() or None

                cursor.execute(
                    sql_insert_new,
                    (
                        item.floor_level or "Level 1",
                        item.floor_area_type or "Dry",
                        net_val,
                        prod_val,
                        short_name_val,
                        job_hw_id,
                        user_update
                    )
                )
                inserted_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "inserted": inserted_count
            })

        # Commit Transaction khi tất cả các bước thành công
        conn.commit()
        logger.info(f"Save AreaSummary success in ProcurementApp by user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Successfully saved {len(payload.jobs)} Job(s) to ProcurementApp AreaSummary.",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                logger.warning("Rollback Transaction AreaSummary due to error.")
            except Exception as rb_err:
                logger.error(f"Error when rollback MSSQL: {rb_err}")

        logger.error(f"Error saving AreaSummary: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving AreaSummary MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()
