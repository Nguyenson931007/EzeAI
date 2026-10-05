"""
api/insulation_routes.py – Insulation API Router
==================================================
Cung cấp REST endpoint để truy vấn và lưu tính diện tích cách nhiệt tường vào [emsflow].[dbo].[Insulation]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng CONVERT(VARCHAR(50), NEWID()).
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id
from api.unit_scope import get_active_unit, unit_filter, unit_value_sql

logger = logging.getLogger("ezefloor.insulation")

router = APIRouter(prefix="/api/insulation")


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class InsulationItemSchema(BaseModel):
    wall_type: Optional[str] = Field("Ext wall", description="Loại tường: Ext wall, Int Wall, Partial wall...")
    insulation_type: Optional[str] = Field(None, description="Loại cách nhiệt (InsulationType)")
    product: Optional[str] = Field(None, description="Tên / quy cách sản phẩm (Product)")
    wall_height: Optional[Union[float, int]] = Field(2400.0, description="Chiều cao tường (mm)")
    wall_length: Optional[Union[float, int]] = Field(0.0, description="Chiều dài tường (mm)")
    total_area: Optional[Union[float, int]] = Field(None, description="Tổng diện tích cách nhiệt net (m²)")
    insulation_area: Optional[Union[float, int]] = Field(None, description="Diện tích cách nhiệt (m²)")
    total_area_raked: Optional[Union[float, int]] = Field(0.0, description="Tổng diện tích tường vát (m²)")
    total_area_door: Optional[Union[float, int]] = Field(0.0, description="Tổng diện tích cửa (m²)")
    r_value: Optional[Union[float, int, str]] = Field("R2.0", description="Chỉ số R-Value (vd: R2.5, 2.5)")
    short_name: Optional[str] = Field("BUN-NSW-ACT", description="Tên viết tắt khách hàng / module")
    floor_level: Optional[str] = Field("GF", description="Tầng (GF, FF, SF...)")


class InsulationJobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    items: List[InsulationItemSchema] = Field(default_factory=list, description="Danh sách các mục insulation")


class SaveInsulationJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[InsulationJobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB INSULATION HIỆN TẠI (GET /api/insulation/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_insulation_jobs(request: Request, office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection(); cursor = conn.cursor(as_dict=True)
        execute_procedure(cursor, "dbo.usp_EzeFloor_Insulation_List", {"Unit": active_unit, "Office": (office or "EZE0098").strip().upper() or None})
        rows = cursor.fetchall(); formatted_rows = []
        for r in rows:
            raw_len = float(r["wall_length"]) if r.get("wall_length") is not None else 0.0
            wall_len_mm = raw_len * 1000.0 if 0 < raw_len < 1000.0 else raw_len
            raw_r = r.get("r_value"); r_fmt = f"R{float(raw_r):.1f}" if raw_r is not None else "R2.0"
            formatted_rows.append({"insulation_id": str(r.get("insulation_id")) if r.get("insulation_id") else None,"IdJob_HW":r.get("IdJob_HW"),"hw_id":r.get("hw_id"),"job_number":r.get("job_number"),"floor_level":r.get("floor_level") or "GF","insulation_type":r.get("insulation_type"),"wall_type":r.get("wall_type") or r.get("insulation_type"),"product":r.get("product"),"wall_height":float(r["wall_height"]) if r.get("wall_height") is not None else 0.0,"wall_length":round(wall_len_mm,4),"total_area_raked":float(r["total_area_raked"]) if r.get("total_area_raked") is not None else 0.0,"total_area_door":float(r["total_area_door"]) if r.get("total_area_door") is not None else 0.0,"r_value":r_fmt,"short_name":r.get("short_name") or "BUN-NSW-ACT","user_update":r.get("user_update"),"datetime_update":r["datetime_update"].isoformat() if r.get("datetime_update") else None,"is_old_data":r.get("is_old_data",0)})
        return {"success":True,"total":len(formatted_rows),"data":formatted_rows}
    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách Insulation Jobs: {e}"); raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Insulation: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH INSULATION VÀO MSSQL (POST /api/insulation/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_insulation_jobs(request: Request, payload: SaveInsulationJobsPayloadSchema):
    active_unit = get_active_unit(request); conn = None
    try:
        conn=get_mssql_connection(); conn.autocommit(False); cursor=conn.cursor(); user_update=payload.user_update or "EZE0098"; saved=[]
        for job in payload.jobs:
            job_hw_id=resolve_job_hw_id(cursor, job.id_job_hw, api_file=__file__)
            execute_procedure(cursor,"dbo.usp_EzeFloor_Insulation_Archive",{"JobHwId":job_hw_id,"Unit":active_unit,"UserUpdate":user_update})
            count=0
            for item in job.items:
                rv=str(item.r_value if item.r_value is not None else "2.0").upper().replace("R","").strip()
                try: rv=float(rv)
                except Exception: rv=2.0
                execute_procedure(cursor,"dbo.usp_EzeFloor_Insulation_Insert",{"JobHwId":job_hw_id,"Unit":active_unit,"InsulationType":item.insulation_type or item.wall_type or "Ext wall","Product":(item.product or "").strip(),"WallHeight":round(float(item.wall_height or 2400.0),2),"WallLength":round(float(item.wall_length or 0.0),2),"RValue":round(rv,2),"ShortName":(item.short_name or "BUN-NSW-ACT").strip(),"TotalAreaRaked":round(float(item.total_area_raked or 0.0),2),"TotalAreaDoor":round(float(item.total_area_door or 0.0),2),"FloorLevel":(item.floor_level or "GF").strip(),"UserUpdate":user_update}); count+=1
            saved.append({"id_job_hw":job_hw_id,"inserted":count})
        conn.commit(); return {"success":True,"message":f"Đã lưu thành công {len(payload.jobs)} Job(s) vào [ProcurementApp].[dbo].[Insulation].","user_update":user_update,"jobs_saved":saved}
    except ValueError as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Lỗi khi lưu Insulation: {e}"); raise HTTPException(status_code=500, detail=f"Lỗi khi lưu Insulation MSSQL: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 3. TÍNH TOÁN DIỆN TÍCH INSULATION (POST /api/insulation/calculate)
# ══════════════════════════════════════════════════════

class DoorOnWallSchema(BaseModel):
    width_mm: float = Field(820.0, description="Chiều rộng cửa (mm)")
    height_mm: float = Field(2040.0, description="Chiều cao cửa (mm)")


class WallForCalcSchema(BaseModel):
    id: Optional[str] = Field(None, description="Wall ID (tùy chọn)")
    class_name: Optional[str] = Field("exterior_wall", description="Loại tường: exterior_wall, interior_wall, partition_wall")
    floor_level: Optional[str] = Field("GF", description="Tầng: GF, FF, SF...")
    length_m: Optional[float] = Field(0.0, description="Chiều dài tường (m)")
    length_mm: Optional[float] = Field(None, description="Chiều dài tường (mm)")
    height_mm: float = Field(2400.0, description="Chiều cao tường (mm)")
    page_name: Optional[str] = Field("Tầng 1", description="Tên trang / tầng (e.g. Tầng 1, Tầng 2)")
    doors: List[DoorOnWallSchema] = Field(default_factory=list, description="Danh sách cửa trên tường này")


class CalculateInsulationPayload(BaseModel):
    walls: List[WallForCalcSchema] = Field(..., description="Danh sách tường cùng cửa để tính toán")


def _map_class_to_wall_type(class_name: str) -> str:
    """Map wall class_name sang tên hiển thị Insulation."""
    cn = (class_name or "").lower()
    if "ext" in cn:
        return "Ext wall"
    elif "partition" in cn or "part" in cn:
        return "Partial wall"
    else:
        return "Int Wall"


@router.post("/calculate")
async def calculate_insulation(payload: CalculateInsulationPayload):
    """
    Tính toán diện tích Insulation cho từng tường, sau đó gộp theo (FloorLevel, WallType, WallHeight).
    WallLength được trả về dưới dạng mm.

    Công thức (tính 1 MẶT duy nhất):
      - S_wall  = (wall_height_mm / 1000) × (wall_length_mm / 1000)   [m²]
      - S_door  = Σ (door_width_mm / 1000) × (door_height_mm / 1000) cho tất cả cửa trên tường đó  [m²]
      - total_area_raked = 0.0 (mặc định)
      - total_area_door  = S_door                            [m²]

    Kết quả được gộp theo nhóm (floor_level, wall_type, wall_height) → cộng dồn wall_length (mm), total_area_raked, total_area_door.
    Mỗi hàng bao gồm danh sách chi tiết chi tiết chia theo từng tầng (page_breakdown).
    """
    try:
        # Dict key = (floor_level, wall_type, wall_height_mm) → aggregated values & page breakdowns
        groups = defaultdict(lambda: {
            "wall_length": 0.0,
            "total_area_raked": 0.0,
            "total_area_door": 0.0,
            "wall_ids": [],
            "page_groups": defaultdict(lambda: {
                "wall_length": 0.0,
                "total_area_raked": 0.0,
                "total_area_door": 0.0
            })
        })

        for w in payload.walls:
            wall_type = _map_class_to_wall_type(w.class_name)
            height_mm = w.height_mm or 2400.0

            if w.length_mm is not None and w.length_mm > 0:
                length_mm = w.length_mm
                length_m = length_mm / 1000.0
            else:
                length_m = w.length_m or 0.0
                length_mm = length_m * 1000.0

            page_name = w.page_name or "Tầng 1"

            flr_lvl = (w.floor_level or "").strip().upper()
            if not flr_lvl:
                pn = page_name.upper()
                if "LEVEL 1" in pn or "GROUND" in pn or "GF" in pn or "TRỆT" in pn:
                    flr_lvl = "GF"
                elif "LEVEL 2" in pn or "FIRST" in pn or "FF" in pn or "TẦNG 1" in pn or "1F" in pn:
                    flr_lvl = "FF"
                elif "LEVEL 3" in pn or "SECOND" in pn or "SF" in pn or "TẦNG 2" in pn or "2F" in pn:
                    flr_lvl = "SF"
                elif "LEVEL 4" in pn or "THIRD" in pn or "TF" in pn or "TẦNG 3" in pn or "3F" in pn:
                    flr_lvl = "TF"
                else:
                    flr_lvl = "GF"

            # S_wall = 1 mặt: (height mm → m) × length m
            s_wall = (height_mm / 1000.0) * length_m

            # S_door = tổng diện tích tất cả cửa trên tường này (1 mặt)
            s_door = 0.0
            for door in (w.doors or []):
                door_w_m = (door.width_mm or 0.0) / 1000.0
                door_h_m = (door.height_mm or 0.0) / 1000.0
                s_door += door_w_m * door_h_m

            # Total area raked default to 0.0 (không tự động tính công thức)
            total_area_raked = 0.0

            key = (flr_lvl, wall_type, height_mm)
            groups[key]["wall_length"] += length_mm
            groups[key]["total_area_raked"] += total_area_raked
            groups[key]["total_area_door"] += s_door
            if w.id is not None:
                groups[key]["wall_ids"].append(w.id)

            # Track page/floor breakdown
            pg = groups[key]["page_groups"][page_name]
            pg["wall_length"] += length_mm
            pg["total_area_raked"] += total_area_raked
            pg["total_area_door"] += s_door

        # Build result rows, sorted by floor_level then wall_type then height
        level_order = {"GF": 1, "FF": 2, "SF": 3, "TF": 4, "4F": 5, "5F": 6, "6F": 7, "7F": 8, "8F": 9, "9F": 10, "10F": 11}
        rows = []
        for (fl, wt, hm), vals in sorted(groups.items(), key=lambda x: (level_order.get(x[0][0], 99), x[0][1], x[0][2])):
            page_breakdown = []
            for p_name, p_vals in vals["page_groups"].items():
                page_breakdown.append({
                    "page_name": p_name,
                    "wall_length": round(p_vals["wall_length"], 4),
                    "total_area_raked": round(p_vals["total_area_raked"], 2),
                    "total_area_door": round(p_vals["total_area_door"], 2)
                })

            rows.append({
                "floor_level": fl,
                "wall_type": wt,
                "wall_height": round(hm, 1),
                "wall_length": round(vals["wall_length"], 4),
                "total_area_raked": round(vals["total_area_raked"], 2),
                "total_area_door": round(vals["total_area_door"], 2),
                "wall_ids": vals["wall_ids"],
                "page_breakdown": page_breakdown
            })

        logger.info(f"Insulation calculate: {len(payload.walls)} walls → {len(rows)} grouped rows")
        return {
            "success": True,
            "total_walls": len(payload.walls),
            "rows": rows
        }

    except Exception as e:
        logger.error(f"Lỗi khi tính toán Insulation: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi tính toán Insulation: {str(e)}")
