import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from api.unit_scope import get_active_unit
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id

logger = logging.getLogger("ezefloor.power_truss")

router = APIRouter(prefix="/api/power-truss", tags=["PowerTrussBraces-router"])


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

class PowerTrussItemSchema(BaseModel):
    wall_height: Optional[str] = Field(None, description="Chiều cao tường (VD: 2400, 2700)")
    wallHeight: Optional[str] = Field(None, description="Alias chiều cao tường")
    length: Optional[str] = Field(None, description="Chiều dài (VD: 3000, 6000)")
    type: Optional[str] = Field(None, description="Loại: 'Column' hoặc 'Brace'")
    qty: Optional[Union[float, int, str]] = Field(None, description="Số lượng")
    floor_level: Optional[str] = Field("GF", description="Floor level (GF, FF, SF...)")
    floorLevel: Optional[str] = Field(None, description="Alias Floor level")


class PowerTrussJobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id)")
    items: Optional[List[PowerTrussItemSchema]] = Field(
        None,
        description="Danh sách các dòng Power Truss Braces cho mỗi Job",
    )
    truss_items: Optional[List[PowerTrussItemSchema]] = Field(
        None,
        description="Alias cho danh sách các dòng Power Truss Braces",
    )


class SavePowerTrussPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[PowerTrussJobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu Power Truss Braces")


# ══════════════════════════════════════════════════════
# HELPER: Resolve id_job_hw từ MSSQL
# ══════════════════════════════════════════════════════

def _resolve_power_truss_job(cursor: Any, input_job_id: str) -> str:
    try:
        return resolve_job_hw_id(cursor, input_job_id, api_file=__file__)
    except ValueError:
        raw_id = str(input_job_id or "").strip()
        if not raw_id:
            raise HTTPException(status_code=422, detail="id_job_hw không được để trống.")
        return raw_id


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC POWER TRUSS BRACES HIỆN TẠI (GET /api/power-truss/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_power_truss_jobs(
    request: Request,
    id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw or job_number"),
    office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"),
):
    """
    Truy vấn danh sách Power Truss Braces jobs từ MSSQL [ProcurementApp].[dbo].[PowerTrussBraces].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ptb.IsOldData, 0) = 0.
    """
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        normalized_office = (office or "").strip().upper() or None
        normalized_hw_id = (id_job_hw or "").strip() or None
        execute_procedure(cursor, "dbo.usp_EzeFloor_PowerTruss_List", {
            "Unit": active_unit,
            "JobHwId": normalized_hw_id,
            "Office": normalized_office,
        })
        rows = cursor.fetchall()

        result = []
        for r in rows:
            result.append({
                "id": r.get("id"),
                "id_job_hw": r.get("id_job_hw"),
                "floor_level": str(r.get("floor_level") or "GF").strip(),
                "floorLevel": str(r.get("floor_level") or "GF").strip(),
                "wall_height": str(r.get("wall_height") or ""),
                "wallHeight": str(r.get("wall_height") or ""),
                "length": str(r.get("length") or ""),
                "type": str(r.get("type") or "Column"),
                "qty": float(r.get("qty")) if r.get("qty") is not None else 1.0,
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
        logger.error(f"Lỗi truy vấn Power Truss Braces jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU POWER TRUSS BRACES JOBS (POST /api/power-truss/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_power_truss_jobs(request: Request, payload: SavePowerTrussPayloadSchema):
    """
    Lưu danh sách Power Truss Braces vào MSSQL [ProcurementApp].[dbo].[PowerTrussBraces].
    Quy trình versioning chuẩn:
      1. Lưu các bản ghi cũ của Job thành IsOldData = 1.
      2. Chèn toàn bộ các bản ghi mới với IsOldData = 0.
    """
    user_update = payload.user_update.strip()
    if not user_update:
        raise HTTPException(status_code=422, detail="user_update không được để trống.")

    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)
        cursor = conn.cursor(as_dict=True)

        saved_jobs = []
        for job in payload.jobs:
            job_hw_id = _resolve_power_truss_job(cursor, job.id_job_hw)

            # 1. Archive bản ghi cũ
            execute_procedure(cursor, "dbo.usp_EzeFloor_PowerTruss_Archive", {"JobHwId": job_hw_id, "Unit": active_unit, "UserUpdate": user_update})

            # 2. Thêm mới
            items = job.items if job.items is not None else job.truss_items
            inserted_count = 0
            if items:
                for item in items:
                    wh_val = str(item.wall_height or item.wallHeight or "").strip() or None
                    len_val = str(item.length or "").strip() or None
                    type_val = str(item.type or "Column").strip()
                    qty_val = _parse_decimal(item.qty, default=1.0)
                    fl_val = str(item.floor_level or item.floorLevel or "GF").strip() or "GF"

                    # Bỏ qua dòng trống hoàn toàn
                    if not wh_val and not len_val:
                        continue

                    execute_procedure(cursor, "dbo.usp_EzeFloor_PowerTruss_Insert", {
                        "JobHwId": job_hw_id,
                        "Unit": active_unit,
                        "WallHeight": wh_val,
                        "Length": len_val,
                        "Type": type_val,
                        "Qty": qty_val,
                        "UserUpdate": user_update,
                        "FloorLevel": fl_val,
                    })
                    inserted_count += 1

            saved_jobs.append({
                "id_job_hw": job_hw_id,
                "inserted_count": inserted_count,
            })

        conn.commit()

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(saved_jobs)} Power Truss Braces job(s).",
            "saved_jobs": saved_jobs,
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Lỗi khi lưu Power Truss Braces jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error khi lưu Power Truss Braces: {str(e)}")
    finally:
        if conn:
            conn.close()
