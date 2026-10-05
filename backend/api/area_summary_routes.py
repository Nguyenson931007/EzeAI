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
from api.unit_scope import get_active_unit
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id

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
async def get_area_summary_jobs(request: Request, office: Optional[str] = None):
    """
    Truy vấn danh sách AreaSummary jobs từ MSSQL [ProcurementApp].[dbo].[AreaSummary].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ars.IsOldData, 0) = 0.
    """
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        normalized_office = (office or "EZE0098").strip().upper() or "EZE0098"
        execute_procedure(cursor, "dbo.usp_EzeFloor_AreaSummary_List", {"Unit": active_unit, "Office": normalized_office})
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
    active_unit = get_active_unit(request)
    conn = None
    try:
        # DB safety guard: never version/archive current Flooring rows if the
        # replacement payload contains positive-area rows without Product.
        # The frontend normally resolves Product from the active dropdown, but
        # this backend check prevents Product=NULL corruption from any caller.
        missing_product_rows = []
        for job_index, job in enumerate(payload.jobs):
            for area_index, item in enumerate(job.areas):
                net_val = float(item.net_area) if item.net_area is not None else 0.0
                if net_val > 0 and not (item.product or "").strip():
                    missing_product_rows.append({
                        "job_index": job_index,
                        "area_index": area_index,
                        "floor_level": item.floor_level or "GF",
                        "floor_area_type": item.floor_area_type or "Dry",
                    })

        if missing_product_rows:
            preview = ", ".join(
                f"{row['floor_level']} {row['floor_area_type']}"
                for row in missing_product_rows[:5]
            )
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Cannot save AreaSummary: {len(missing_product_rows)} positive-area row(s) "
                    f"have no Product. Missing: {preview}"
                ),
            )

        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = (payload.user_update or "").strip()
        if not user_update and request:
            user_update = (request.headers.get("x-username") or "").strip()
        if not user_update:
            user_update = "admin"

        saved_summary = []

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            try:
                job_hw_id = resolve_job_hw_id(cursor, raw_id, api_file=__file__)
            except ValueError:
                job_hw_id = raw_id

            # 1. Chuyển các bản ghi cũ của Job này thành IsOldData = 1
            execute_procedure(cursor, "dbo.usp_EzeFloor_AreaSummary_Archive", {"JobHwId": job_hw_id, "Unit": active_unit, "UserUpdate": user_update})

            # 2. Thêm mới các mốc diện tích hiện tại (IsOldData = 0)
            inserted_count = 0
            for item in job.areas:
                net_val = float(item.net_area) if item.net_area is not None else 0.0
                short_name_val = (item.short_name or "").strip() or "BUN-NSW-ACT"
                prod_val = (item.product or "").strip() or None

                execute_procedure(cursor, "dbo.usp_EzeFloor_AreaSummary_Insert", {"JobHwId": job_hw_id, "Unit": active_unit, "FloorLevel": item.floor_level or "Level 1", "FloorAreaType": item.floor_area_type or "Dry", "NetArea": net_val, "Product": prod_val, "ShortName": short_name_val, "UserUpdate": user_update})
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

    except HTTPException:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise
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
