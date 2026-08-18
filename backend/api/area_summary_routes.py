"""
api/area_summary_routes.py – AreaSummary API Router
==================================================
Cung cấp REST endpoint để truy vấn và lưu tính diện tích phòng vào [emsflow].[dbo].[AreaSummary]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng CONVERT(VARCHAR(50), NEWID()).
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.area_summary")

router = APIRouter(prefix="/api/area-summary")


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class AreaItemSchema(BaseModel):
    floor_level: Optional[str] = Field("GF", description="Tầng: GF, L1, etc.")
    floor_area_type: Optional[str] = Field("Dry", description="Loại khu vực: Dry, Wet, Internal, External")
    net_area: Optional[Union[float, int]] = Field(0.0, description="Diện tích thực tế (m²)")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    areas: List[AreaItemSchema] = Field(default_factory=list, description="Danh sách các mục diện tích bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB AREA SUMMARY HIỆN TẠI (GET /api/area-summary/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_area_summary_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách AreaSummary jobs từ MSSQL [emsflow].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ars.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                ars.ID AS area_summary_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                ars.FloorLevel AS floor_level,
                ars.FloorAreaType AS floor_area_type,
                ars.NetArea AS net_area,
                ars.UserUpdate AS user_update,
                ars.DatetimeUpdate AS datetime_update,
                ars.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [emsflow].[dbo].[AreaSummary] ars
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
                AND aj.MaNV = 'EZE0098'
            

            ORDER BY tghw.id DESC, ars.ID DESC;
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        formatted_rows = []
        for r in rows:
            formatted_rows.append({
                "area_summary_id": r.get("area_summary_id"),
                "IDJob_HW": r.get("IDJob_HW"),
                "hw_id": r.get("hw_id"),
                "job_number": r.get("job_number"),
                "floor_level": r.get("floor_level"),
                "floor_area_type": r.get("floor_area_type"),
                "net_area": float(r["net_area"]) if r.get("net_area") is not None else 0.0,
                "user_update": r.get("user_update"),
                "datetime_update": r["datetime_update"].isoformat() if r.get("datetime_update") else None,
                "is_old_data": r.get("is_old_data", 0)
            })

        logger.info(f"Lấy thành công {len(formatted_rows)} bản ghi AreaSummary cho User 'EZE0098'.")
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
async def save_area_summary_jobs(payload: SaveJobsPayloadSchema):
    """
    Lưu danh sách bóc tách AreaSummary của nhiều Jobs vào MSSQL CSDL [emsflow].[dbo].[AreaSummary].
    Thực hiện hoàn toàn trong DATABASE TRANSACTION với IsOldData versioning.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = payload.user_update or "EZE0098"
        saved_summary = []

        sql_archive_old = """
            UPDATE [emsflow].[dbo].[AreaSummary]
            SET
                IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE
                IDJob_HW = %s
                AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [emsflow].[dbo].[AreaSummary]
            (
                ID,
                FloorLevel,
                FloorAreaType,
                NetArea,
                IDJob_HW,
                UserUpdate,
                DatetimeUpdate,
                IsOldData
            )
            VALUES
            (
                CONVERT(VARCHAR(50), NEWID()),
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
            job_hw_id = job.id_job_hw

            # 1. Chuyển các bản ghi cũ của Job này thành IsOldData = 1
            cursor.execute(sql_archive_old, (user_update, job_hw_id))

            # 2. Thêm mới các mốc diện tích hiện tại (IsOldData = 0)
            inserted_count = 0
            for item in job.areas:
                cursor.execute(
                    sql_insert_new,
                    (
                        item.floor_level or "GF",
                        item.floor_area_type or "Dry",
                        item.net_area or 0.0,
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
        logger.info(f"Save AreaSummary thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Job(s) vào MSSQL AreaSummary.",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                logger.warning("Đã Rollback Transaction AreaSummary do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu AreaSummary: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu AreaSummary MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()
