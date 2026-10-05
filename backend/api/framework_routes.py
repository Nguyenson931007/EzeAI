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
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id
from api.unit_scope import get_active_unit, unit_filter, unit_value_sql

logger = logging.getLogger("ezefloor.framework")

router = APIRouter(prefix="/api/framework")

_BUN_VIC_UPPER_FLOORS_MARKER = "BUN-VIC UPPER FLOORS"


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
    floor_level: Optional[str] = Field("GF", description="Mã tầng (VD: GF, FF, SF, TF); mặc định GF")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    upper_floors: Optional[Union[float, int]] = Field(
        None,
        ge=0,
        description="BUN-VIC workbook Upper Floor count; stored as FrameWork metadata",
    )
    walls: List[WallItemSchema] = Field(default_factory=list, description="Danh sách các mốc tường bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB HIỆN TẠI (GET /api/framework/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_framework_jobs(request: Request, office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        normalized_office = (office or "EZE0098").strip().upper() or None
        execute_procedure(cursor, "dbo.usp_EzeFloor_FrameWork_List", {"Unit": active_unit, "Office": normalized_office})
        rows = cursor.fetchall()
        result = []
        for row in rows:
            item = {}
            for key, val in row.items():
                if val is None or isinstance(val, (int, float, str, bool)):
                    item[key] = val
                else:
                    item[key] = str(val)
            result.append(item)
        return {"success": True, "total": len(result), "data": result}
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
    user_update = (payload.user_update or "").strip() or ((request.headers.get("x-username") or "").strip() if request else "") or "admin"
    if not payload.jobs:
        raise HTTPException(status_code=400, detail="Danh sách jobs không được để trống")
    for job in payload.jobs:
        if not job.id_job_hw:
            raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc cho tất cả các Job trong danh sách")
        for wall in job.walls:
            if (wall.floor_type or "").strip() not in ["Timber", "Slab"]:
                raise HTTPException(status_code=400, detail=f"floor_type '{wall.floor_type}' không hợp lệ cho Job {job.id_job_hw}.")

    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection(); conn.autocommit(False); cursor = conn.cursor()
        saved_summary = []
        for job in payload.jobs:
            job_hw_id = resolve_job_hw_id(cursor, job.id_job_hw, api_file=__file__)
            execute_procedure(cursor, "dbo.usp_EzeFloor_FrameWork_Archive", {"JobHwId": job_hw_id, "Unit": active_unit, "UserUpdate": user_update})
            inserted = 0
            for wall in job.walls:
                execute_procedure(cursor, "dbo.usp_EzeFloor_FrameWork_Insert", {
                    "JobHwId": job_hw_id, "Unit": active_unit,
                    "WallHeight": _parse_decimal(wall.wall_height, 2440), "WallLength": _parse_decimal(wall.wall_length, 0),
                    "TheWallAbove": wall.floor_type, "Spacing": _parse_decimal(wall.spacing, 900),
                    "RodSize": _parse_rod_size(wall.rod_size, "M12"), "ShortName": wall.short_name or "BUN-NSW-ACT",
                    "FloorLevel": str(wall.floor_level or "GF").strip().upper() or "GF", "UserUpdate": user_update,
                })
                inserted += 1
            upper_saved = job.upper_floors is not None
            if upper_saved:
                short_name = next((str(w.short_name).strip() for w in job.walls if w.short_name and str(w.short_name).strip()), "BUN-VIC")
                execute_procedure(cursor, "dbo.usp_EzeFloor_FrameWork_Insert", {
                    "JobHwId": job_hw_id, "Unit": active_unit, "WallHeight": _parse_decimal(job.upper_floors, 0),
                    "WallLength": 0, "TheWallAbove": _BUN_VIC_UPPER_FLOORS_MARKER, "Spacing": 0, "RodSize": "N/A",
                    "ShortName": short_name, "FloorLevel": "META", "UserUpdate": user_update,
                })
            saved_summary.append({"id_job_hw": job_hw_id, "walls_inserted": inserted, "upper_floors_saved": upper_saved})
        conn.commit()
        return {"success": True, "message": f"Đã lưu thành công {len(payload.jobs)} Job(s) vào MSSQL FrameWork.", "user_update": user_update, "jobs_saved": saved_summary}
    except ValueError as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Lỗi khi lưu FrameWork: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu FrameWork MSSQL: {str(e)}")
    finally:
        if conn: conn.close()

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
    floor_level = str(payload.get("floor_level") or payload.get("floorLevel") or "GF").strip().upper() or "GF"
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
