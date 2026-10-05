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
from app.mssql_db import get_procurement_connection
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id
from api.unit_scope import get_active_unit, unit_filter, unit_value_sql

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
async def get_cladding_jobs(request: Request, office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_procurement_connection(); cursor=conn.cursor(as_dict=True)
        execute_procedure(cursor,"dbo.usp_EzeFloor_Cladding_List",{"Unit":active_unit,"Office":(office or "").strip().upper() or None})
        rows=cursor.fetchall(); result=[]
        for row in rows:
            item={k:(v if v is None or isinstance(v,(int,float,str,bool)) else str(v)) for k,v in row.items()}; item["floor_level"]=row.get("floor_level") or "GF"; result.append(item)
        return {"success":True,"total":len(result),"data":result}
    except Exception as e:
        logger.error(f"Lỗi truy vấn Cladding jobs: {e}"); raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Cladding: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH CLADDING TRANSACTION & VERSIONING (POST /api/cladding/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_cladding_jobs(payload: SaveJobsPayloadSchema, request: Request = None):
    user_update=(payload.user_update or "").strip() or ((request.headers.get("x-username") or "").strip() if request else "") or "admin"
    if not payload.jobs: raise HTTPException(status_code=400,detail="Danh sách jobs không được để trống")
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_procurement_connection(); conn.autocommit(False); cursor=conn.cursor(); saved=[]
        for job in payload.jobs:
            job_hw_id=resolve_job_hw_id(cursor,job.id_job_hw,api_file=__file__)
            execute_procedure(cursor,"dbo.usp_EzeFloor_Cladding_Archive",{"JobHwId":job_hw_id,"Unit":active_unit,"UserUpdate":user_update})
            count=0
            for wall in job.walls:
                execute_procedure(cursor,"dbo.usp_EzeFloor_Cladding_Insert",{"JobHwId":job_hw_id,"Unit":active_unit,"WallHeight":_parse_decimal(wall.wall_height,2.44),"WallLength":_parse_decimal(wall.wall_length,0),"ShortName":wall.short_name or "BUN-NSW-ACT","FloorLevel":str(wall.floor_level or "GF").strip().upper() or "GF","UserUpdate":user_update}); count+=1
            saved.append({"id_job_hw":job_hw_id,"walls_inserted":count})
        conn.commit(); return {"success":True,"message":f"Đã lưu thành công {len(payload.jobs)} Cladding Job(s) vào MSSQL [ProcurementApp].[dbo].[Cladding].","user_update":user_update,"jobs_saved":saved}
    except ValueError as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Lỗi khi lưu Cladding: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi khi lưu Cladding MSSQL: {str(e)}")
    finally:
        if conn: conn.close()

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
