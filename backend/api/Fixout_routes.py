

import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id
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
# 1. TRUY VẤN CÁC FIXOUT HIỆN TẠI (GET /api/fixout/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_fixout_jobs(request: Request, id_job_hw: Optional[str] = Query(None, description="Filter by id_job_hw"), office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_mssql_connection(); cursor=conn.cursor(as_dict=True)
        execute_procedure(cursor,"dbo.usp_EzeFloor_Fixout_List",{"Unit":active_unit,"JobHwId":(id_job_hw or "").strip() or None,"Office":(office or "").strip().upper() or None})
        rows=cursor.fetchall(); result=[]
        for row in rows:
            item={k:(v if v is None or isinstance(v,(int,float,str,bool)) else str(v)) for k,v in row.items()}; item["floor_level"]=str(row.get("floor_level") or "GF").strip(); item["floorLevel"]=item["floor_level"]; result.append(item)
        return {"success":True,"total":len(result),"data":result}
    except Exception as e:
        logger.error(f"Lỗi truy vấn Fixout jobs: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi truy vấn MSSQL Fixout: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 2. LƯU FIXOUT TRANSACTION & VERSIONING (POST /api/fixout/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_fixout_jobs(request: Request, payload: SaveFixoutPayloadSchema):
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_mssql_connection(); conn.autocommit(False); cursor=conn.cursor(); user_update=(payload.user_update or "").strip(); saved=[]
        for job in payload.jobs:
            job_hw_id=resolve_job_hw_id(cursor,job.id_job_hw,api_file=__file__)
            execute_procedure(cursor,"dbo.usp_EzeFloor_Fixout_Archive",{"JobHwId":job_hw_id,"Unit":active_unit,"UserUpdate":user_update})
            count=0
            for item in job.fixout_items:
                execute_procedure(cursor,"dbo.usp_EzeFloor_Fixout_Insert",{"JobHwId":job_hw_id,"Unit":active_unit,"Category":(item.category or "").strip() or None,"DoorLabel":(item.door_label or "").strip() or None,"DoorType":(item.door_type or "").strip() or None,"Height":_parse_decimal(item.height),"Width":_parse_decimal(item.width),"Thicks":_parse_decimal(item.thicks),"WallWidth":_parse_decimal(item.wall_width),"DoorFrame":(item.door_frame or "").strip() or None,"LiftOffPivot":(item.lift_off_pivot or "").strip() or None,"Handing":(item.handing or "").strip() or None,"Hole":(item.hole or "").strip() or None,"Finish":(item.finish or "").strip() or None,"DoorFurniture":(item.door_furniture or "").strip() or None,"DoorStop":(item.door_stop or "").strip() or None,"Qty":_parse_decimal(item.qty),"FloorLevel":str(item.floor_level or item.floorLevel or "GF").strip() or "GF","UserUpdate":user_update}); count+=1
            saved.append({"id_job_hw":job_hw_id,"inserted":count})
        conn.commit(); return {"success":True,"message":f"Đã lưu thành công {len(payload.jobs)} Fixout Job(s) vào MSSQL [ProcurementApp].[dbo].[Fixout].","user_update":user_update,"jobs_saved":saved}
    except ValueError as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Lỗi lưu Fixout: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi lưu Fixout MSSQL: {str(e)}")
    finally:
        if conn: conn.close()

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
    user_update=request.headers.get("x-username","system"); conn=None
    try:
        conn=get_mssql_connection(); cursor=conn.cursor(); execute_procedure(cursor,"dbo.usp_EzeFloor_Fixout_Delete",{"FixoutId":fixout_id.strip(),"UserUpdate":user_update}); conn.commit(); return {"success":True,"message":f"Đã xóa Fixout row ID={fixout_id}."}
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Lỗi xóa Fixout row: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi xóa Fixout: {str(e)}")
    finally:
        if conn: conn.close()

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
