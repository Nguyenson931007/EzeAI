"""
api/lockup_routes.py – LockUp API Router
============================================
Cung cấp REST endpoint để truy vấn và lưu thông số cửa bóc tách LockUp vào [ProcurementApp].[dbo].[LockUp]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0).
2. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION.
"""

import logging
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id
from api.unit_scope import get_active_unit, unit_filter, unit_value_sql
from app.lockup_procurement_options import BUN_SEQLD_LOCKUP_OPTIONS

logger = logging.getLogger("ezefloor.lockup")

router = APIRouter(prefix="/api/lockout")


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class LockoutItemSchema(BaseModel):
    mode: Optional[str] = Field(None, description="Mode (e.g. Prehung, Loose...)")
    scope: Optional[str] = Field(None, description="Scope (e.g. external, internal...)")
    label: Optional[str] = Field(None, description="Nhãn cửa (e.g. Entry Door, Bedroom Door...)")
    door_type: Optional[str] = Field(None, description="Loại/model cửa từ dropdown (e.g. SCX1 PCM, HAG9...)")
    height: Optional[Union[float, int]] = Field(None, description="Chiều cao cửa (mm)")
    width: Optional[Union[float, int]] = Field(None, description="Chiều rộng cửa (mm)")
    thickness: Optional[Union[float, int]] = Field(None, description="Độ dày cửa (mm)")
    jamb_or_wall: Optional[str] = Field(None, description="Jamb or Wall (e.g. 90mm Wall, Steel Frame...)")
    jamb_size: Optional[str] = Field(None, description="Kích thước Jamb (e.g. 112x19mm...)")
    hung: Optional[str] = Field(None, description="Hướng mở hung (Hung A, Hung B...)")
    type: Optional[str] = Field(None, description="Kiểu khung/cấu hình cũ (Type A, Type CG...)")
    weatherguard: Optional[Union[str, bool, int]] = Field("No", description="External door Weatherguard flag")
    dbl_rebated: Optional[Union[str, bool, int]] = Field("No", description="External door double-rebated jamb flag")
    door_stop: Optional[str] = Field(None, description="Chặn cửa door_stop (Cushion, DS2 with Riser...)")
    internal_type: Optional[str] = Field(None, description="Internal type (HF/HO for NSW/QLD, HL/HO for VIC)")
    color: Optional[str] = Field(None, description="Màu sắc color (CHR, SCH...)")
    default_qty: Optional[Union[float, int]] = Field(1.0, description="Số lượng default_qty")
    short_name: Optional[str] = Field("BUN-NSW-ACT", description="Tên viết tắt khách hàng / module")


class LockoutJobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    items: List[LockoutItemSchema] = Field(default_factory=list, description="Danh sách các mục LockUp")


class SaveLockoutJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[LockoutJobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# DROPDOWN DOOR OPTIONS (READ-ONLY)
# ══════════════════════════════════════════════════════

def _query_catalog_options(cursor, group: str, customer_id: str) -> List[str]:
    try:
        execute_procedure(cursor, "dbo.usp_EzeFloor_CatalogOptions_List", {"CustomerId": customer_id, "OptionGroup": group})
        rows = cursor.fetchall()
        return [str(r.get("option_value") or "").strip() for r in rows if str(r.get("option_value") or "").strip()]
    except Exception as e:
        logger.warning(f"Failed to query catalog_options for {group}: {e}")
        return []


def _query_internal_door_types(cursor, prehung: bool, customer_id: str) -> List[str]:
    start_row, end_row = (2, 2214) if prehung else (2216, 5000)
    try:
        execute_procedure(cursor, "dbo.usp_EzeFloor_InternalDoorTypes_List", {"CustomerId": customer_id, "StartRow": start_row, "EndRow": end_row})
        rows = cursor.fetchall()
        return [str(r.get("door_type") or "").strip() for r in rows if str(r.get("door_type") or "").strip()]
    except Exception as e:
        logger.warning(f"Failed to query internal door types from catalog: {e}")
        return []


def _query_external_door_types(cursor, customer_id: str) -> List[str]:
    try:
        execute_procedure(cursor, "dbo.usp_EzeFloor_ExternalDoorTypes_List", {"CustomerId": customer_id})
        rows = cursor.fetchall()
        values: List[str] = []
        for r in rows:
            full_key = str(r.get("lookup_value") or "").strip()
            first_space = full_key.find(" ")
            if first_space >= 0 and full_key[first_space + 1:]:
                values.append(full_key[first_space + 1:].strip())

        priority = {"SCX1": 1, "JST1": 2, "JST10": 3, "XS26": 4, "ABC": 5}
        values.sort(key=lambda val: (priority.get(val.split(" ", 1)[0], 999), val))
        unique: List[str] = []
        seen = set()
        for v in values:
            if v not in seen and v:
                seen.add(v)
                unique.append(v)
        if unique:
            return ["TBA", *unique]
        return []
    except Exception as e:
        logger.warning(f"Failed to query external door types from product_catalog: {e}")
        return []


@router.get("/options")
@router.get("/door-types")
async def get_lockout_options(customer_id: str = Query("BUN-NSW-ACT", min_length=1, max_length=100)):
    """Return LockUp selector options for the active customer.

    BUN-SEQLD must mirror ProcurementApp's workbook-approved business options
    exactly. Other customers keep the existing DB-backed EzeFloor behaviour.
    """
    customer_key = str(customer_id or "").strip().upper()
    if customer_key == "BUN-SEQLD":
        # Source of truth: ProcurementApp
        # backend/app/customer_modules/bunnings_qld/lockup/api.py
        res_data = {key: list(values) for key, values in BUN_SEQLD_LOCKUP_OPTIONS.items()}
        return {"success": True, "data": res_data, **res_data}

    prehung_int: List[str] = []
    loose_int: List[str] = []
    external_types: List[str] = []
    jamb_ext: List[str] = []
    jamb_int: List[str] = []

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        prehung_int = _query_catalog_options(cursor, "List_Prehung", customer_id)
        loose_int = _query_catalog_options(cursor, "List_LooseJamb", customer_id)
        jamb_ext = _query_catalog_options(cursor, "JambSizeExternal", customer_id)
        jamb_int = _query_catalog_options(cursor, "JambSizeInternal", customer_id)

        if not prehung_int:
            prehung_int = _query_internal_door_types(cursor, prehung=True, customer_id=customer_id)
        if not loose_int:
            loose_int = _query_internal_door_types(cursor, prehung=False, customer_id=customer_id)

        external_types = _query_external_door_types(cursor, customer_id)
    except Exception as db_err:
        logger.warning(f"MSSQL lockup options query failed ({db_err})")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    # ProcurementApp is the source of truth for option data.  Do not merge
    # deleted selector snapshots or stale local jamb lists into a valid DB
    # response.  The frontend owns the same static workbook fallbacks used by
    # ProcurementApp when a configured option group is genuinely empty.

    is_bun_vic = customer_key == "BUN-VIC"

    # Keep the customer-specific form semantics in sync with ProcurementApp.
    # Product/catalog lists above remain DB-backed; only workbook-style selector
    # fallbacks live here.
    internal_hung = (
        ["LH", "RH", "LH LO", "RH LO", "DBL", "Set of THREE", "Set of FOUR", "Set of SIX", "Set of EIGHT"]
        if is_bun_vic
        else ["RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"]
    )
    internal_hole = ["HO", "HL"] if is_bun_vic else ["HF", "HO"]

    res_data = {
        "internal": prehung_int,
        "external": external_types,
        "prehung_internal": prehung_int,
        "loose_jamb_internal": loose_int if loose_int else prehung_int,
        "jamb_size_external": jamb_ext,
        "jamb_size_internal": jamb_int,
        "external_hung": ["Hung A", "Hung B", "Hung CG", "Hung DG", "Hung G", "Pivot Door"],
        "external_type": ["Type A", "Type B", "Type CG", "Type DG", "Type G", "Pivot Frame A", "Pivot Frame B", "Steel Frame"],
        "internal_hung": internal_hung,
        "internal_type": ["Steel Frame", "Ezy Jamb"],
        "internal_hole": internal_hole,
        "internal_finish": ["CHR", "SCH"],
        "door_stop": ["Cushion", "DS2 with Riser"],
    }

    return {
        "success": True,
        "data": res_data,
        **res_data
    }


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB LOCKUP HIỆN TẠI (GET /api/lockout/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_lockout_jobs(request: Request, office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098"), job_number: Optional[str] = Query(None, description="Filter by specific JobNumber or hw_id")):
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_mssql_connection(); cursor=conn.cursor(as_dict=True)
        execute_procedure(cursor,"dbo.usp_EzeFloor_LockUp_List",{"Unit":active_unit,"Office":(office or "EZE0098").strip().upper() or None,"JobNumber":(job_number or "").strip() or None})
        rows=cursor.fetchall(); data=[]
        for r in rows:
            data.append({"lockout_id":str(r.get("lockout_id")) if r.get("lockout_id") else None,"IdJob_HW":r.get("IdJob_HW"),"hw_id":r.get("hw_id"),"job_number":r.get("job_number"),"mode":r.get("mode"),"scope":r.get("scope"),"label":r.get("label"),"door_type":r.get("door_type"),"height":float(r["height"]) if r.get("height") is not None else None,"width":float(r["width"]) if r.get("width") is not None else None,"thickness":float(r["thickness"]) if r.get("thickness") is not None else None,"jamb_or_wall":r.get("jamb_or_wall"),"jamb_size":str(r["jamb_size"]) if r.get("jamb_size") is not None else None,"hung":r.get("hung"),"type":r.get("type"),"weatherguard":"Yes" if bool(r.get("Weatherguard")) else "No","dbl_rebated":"Yes" if bool(r.get("DBLRebated")) else "No","door_stop":r.get("door_stop"),"internal_type":r.get("internal_type"),"color":r.get("color"),"default_qty":float(r["default_qty"]) if r.get("default_qty") is not None else 1.0,"short_name":r.get("short_name") or "BUN-NSW-ACT","user_update":r.get("user_update"),"datetime_update":str(r.get("datetime_update")) if r.get("datetime_update") else None,"is_old_data":bool(r.get("is_old_data",0))})
        return {"success":True,"count":len(data),"data":data}
    except Exception as e:
        logger.error(f"Error fetching LockUp jobs: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi hệ thống khi tải LockUp Jobs: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH LOCKUP VÀO MSSQL (POST /api/lockout/save-jobs)
# ══════════════════════════════════════════════════════

def _to_bit(value: Any) -> int:
    """Normalize frontend Yes/No/bool values to SQL Server BIT safely."""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return 1 if value else 0
    return 1 if str(value or "").strip().lower() in {"yes", "y", "true", "1", "on"} else 0

@router.post("/save-jobs")
async def save_lockout_jobs(request: Request, payload: SaveLockoutJobsPayloadSchema):
    active_unit=get_active_unit(request); conn=None
    try:
        conn=get_mssql_connection(); conn.autocommit(False); cursor=conn.cursor(); user_update=payload.user_update or "EZE0098"; saved=[]
        for job in payload.jobs:
            job_hw_id=resolve_job_hw_id(cursor,job.id_job_hw,api_file=__file__)
            execute_procedure(cursor,"dbo.usp_EzeFloor_LockUp_Archive",{"JobHwId":job_hw_id,"Unit":active_unit,"UserUpdate":user_update})
            count=0
            for item in job.items:
                execute_procedure(cursor,"dbo.usp_EzeFloor_LockUp_Insert",{"JobHwId":job_hw_id,"Unit":active_unit,"Mode":item.mode,"Scope":item.scope,"Label":item.label,"DoorType":item.door_type,"Height":item.height,"Width":item.width,"Thickness":item.thickness,"JambOrWall":item.jamb_or_wall,"JambSize":item.jamb_size,"Hung":item.hung,"Type":item.type,"Weatherguard":_to_bit(item.weatherguard),"DBLRebated":_to_bit(item.dbl_rebated),"DoorStop":item.door_stop,"InternalType":item.internal_type,"Color":item.color,"DefaultQty":item.default_qty or 1.0,"ShortName":item.short_name or "BUN-NSW-ACT","UserUpdate":user_update}); count+=1
            saved.append({"id_job_hw":job_hw_id,"inserted":count})
        conn.commit(); return {"success":True,"message":f"Đã lưu thành công {len(payload.jobs)} Job(s) vào MSSQL [ProcurementApp].[dbo].[LockUp].","user_update":user_update,"jobs_saved":saved}
    except ValueError as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except Exception: pass
        logger.error(f"Error saving LockUp jobs: {e}"); raise HTTPException(status_code=500,detail=f"Lỗi hệ thống khi lưu LockUp: {str(e)}")
    finally:
        if conn: conn.close()

# ══════════════════════════════════════════════════════
# 3. TÍNH TOÁN LOCKOUT TỪ CỬA CANVAS (POST /api/lockout/calculate)
# ══════════════════════════════════════════════════════

class DoorCalcPayload(BaseModel):
    doors: List[Any] = Field(default_factory=list, description="Danh sách các cửa từ Canvas")
    customer_id: Optional[str] = Field("BUN-NSW-ACT", description="Customer module used for LockUp form parity")


@router.post("/calculate")
async def calculate_lockout(payload: DoorCalcPayload):
    """
    Tính toán khối lượng LockOut tự động từ dữ liệu cửa vẽ trên Canvas.
    - scope: 'external' cho External Penetrations (External Hinged Door, External Sliding Door, Garage Door...), 'internal' cho Internal Penetrations
    - height: chiều cao cửa (d.height_mm / d.height)
    - width: chiều rộng cửa (d.width_mm / d.width)
    - jamb_or_wall: độ dày/loại tường (70mm Wall, 90mm Wall, 110mm Wall...)
    - hung: Hinge Side ('LH' cho Left Hinge, 'RH' cho Right Hinge)
    """
    import re
    doors = payload.doors or []
    customer_key = str(payload.customer_id or "BUN-NSW-ACT").strip().upper()
    is_bun_vic = customer_key == "BUN-VIC"
    grouped = {}

    for idx, d in enumerate(doors):
        # 0. Timber Material Filter: Chỉ tính toán bóc tách LockUp cho cửa gỗ (Timber).
        # Bỏ qua các loại chất liệu khác như Steel, Aluminum, Glass, Composite...
        raw_mat = str(
            d.get("material") or 
            d.get("door_material") or 
            d.get("material_type") or 
            "timber"
        ).strip().lower()

        if raw_mat and raw_mat not in ["timber", "wood", "wood_timber", "default", ""] and "timber" not in raw_mat:
            continue

        d_label = str(
            d.get("door_name")
            or d.get("doorName")
            or d.get("doorLabel")
            or (d.get("label") if d.get("label") and not any(k in str(d.get("label")).lower() for k in ["single", "sliding", "window", "door"]) else None)
            or d.get("name")
            or f"D-{idx + 1}"
        ).strip()
        selected_door_type = str(
            d.get("door_type")
            or d.get("lockup_door_type")
            or d.get("product")
            or ""
        ).strip() or None
        try:
            d_width = float(d.get("width_mm") or d.get("width") or 820.0)
        except (ValueError, TypeError):
            d_width = 820.0
        if 0.3 <= d_width <= 6.0:
            d_width = d_width * 1000.0
        elif d_width > 6000.0 or d_width < 300.0:
            d_width = 820.0

        try:
            d_height = float(d.get("height_mm") or d.get("height") or 2040.0)
        except (ValueError, TypeError):
            d_height = 2040.0
        if 1.0 <= d_height <= 3.5:
            d_height = d_height * 1000.0
        elif d_height > 3500.0 or d_height < 1000.0:
            d_height = 2040.0

        # 1. Scope: Lấy theo Door Type (External vs Internal Penetrations)
        explicit_scope = str(d.get("scope") or d.get("location") or "").strip().lower()
        raw_type = str(
            d.get("doorType") or
            d.get("doorTypeId") or 
            d.get("label") or 
            d.get("classification") or ""
        ).lower()

        ext_keywords = ["external", "ext_", "garage"]
        is_ext_flag = bool(d.get("is_ext") or d.get("is_exterior") or d.get("isExternal"))
        if explicit_scope in {"internal", "external"}:
            scope_val = explicit_scope
        elif is_ext_flag:
            scope_val = "external"
        elif any(kw in raw_type for kw in ext_keywords):
            scope_val = "external"
        else:
            scope_val = "internal"

        is_ext = scope_val == "external"

        # 2. Jamb or Wall: Tự động cập nhật theo độ dày tường (Wall Thickness: 70mm Wall, 90mm Wall...)
        raw_jamb = str(
            d.get("jamb_or_wall") or 
            d.get("wall_thickness") or 
            d.get("wallThickness") or 
            d.get("thickness_mm") or 
            d.get("wall_type") or 
            "90mm Wall"
        ).strip()

        if "wall" in raw_jamb.lower():
            jamb_or_wall_val = raw_jamb
        else:
            nums = re.findall(r'\d+', raw_jamb)
            if nums:
                jamb_or_wall_val = f"{nums[0]}mm Wall"
            else:
                jamb_or_wall_val = "90mm Wall"

        # 3. Hinge Side -> Hung (right -> Hung A, left -> Hung B)
        hinge_side = str(
            d.get("hingeSide") or 
            d.get("hinge_side") or 
            d.get("handing") or 
            d.get("hinge") or 
            d.get("hung") or 
            ""
        ).strip().lower()

        if is_bun_vic and not is_ext:
            # VIC internal schedules use the workbook handing vocabulary directly.
            raw_hung = str(d.get("hung") or d.get("handing") or "").strip()
            upper_hung = raw_hung.upper()
            if "DOUBLE" in upper_hung or upper_hung in {"DBL", "DBL DOOR SET"}:
                hung_val = "DBL"
            elif upper_hung in {"SET OF THREE", "SET OF FOUR", "SET OF SIX", "SET OF EIGHT"}:
                hung_val = "Set of " + upper_hung.removeprefix("SET OF ").title()
            elif "RH LO" in upper_hung:
                hung_val = "RH LO"
            elif "LH LO" in upper_hung:
                hung_val = "LH LO"
            elif "RIGHT" in hinge_side or upper_hung in {"RH", "HUNG A"}:
                hung_val = "RH"
            elif "LEFT" in hinge_side or upper_hung in {"LH", "HUNG B"}:
                hung_val = "LH"
            else:
                hung_val = raw_hung or "RH"
        elif "pivot" in hinge_side:
            hung_val = "Pivot Door"
        elif "double" in hinge_side:
            hung_val = "Double Door Set"
        elif "hung cg" in hinge_side:
            hung_val = "Hung CG"
        elif "hung dg" in hinge_side:
            hung_val = "Hung DG"
        elif "hung g" in hinge_side:
            hung_val = "Hung G"
        elif "right" in hinge_side or "rh" in hinge_side or "hung a" in hinge_side:
            hung_val = "Hung A"
        elif "left" in hinge_side or "lh" in hinge_side or "hung b" in hinge_side:
            hung_val = "Hung B"
        elif d.get("hung") and d.get("hung") != "-":
            hung_val = d.get("hung")
        else:
            hung_val = "Hung A"

        mode_text = str(d.get("mode") or d.get("lockup_mode") or "").strip().lower()
        category_text = str(d.get("category") or "").strip().lower()
        cavity_source = " ".join(str(d.get(key) or "") for key in (
            "mode", "lockup_mode", "category", "doorTypeId",
            "penetration_type", "class", "type", "door_name", "doorName", "label"
        )).lower()
        is_cavity = "cavity" in cavity_source
        is_loose = mode_text == "loose" or "loose" in category_text
        resolved_mode = "Cavity" if is_cavity else ("Loose" if is_loose else ("Prehung" if is_ext else (d.get("mode") or "Loose")))

        cad_types = {"single", "sliding", "window", "double", "bifold", "pocket", "cavity", "door", "hinged", "french", "timber", "type a", "type cg"}
        raw_t = str(d.get("type") or "").strip().lower()
        clean_type = "-" if (not raw_t or raw_t in cad_types) else (d.get("type") or "-")
        location_val = "External" if is_ext else "Internal"

        key = f"{d_label}_{selected_door_type}_{d_width}_{d_height}_{scope_val}_{jamb_or_wall_val}_{hung_val}_{resolved_mode}"
        if key not in grouped:
            grouped[key] = {
                "mode": resolved_mode,
                "scope": scope_val,
                "location": location_val,
                "label": d_label,
                "door_type": selected_door_type,
                "height": d_height,
                "width": d_width,
                "thickness": float(d.get("thickness") or d.get("thickness_mm") or (40.0 if is_ext else 35.0)),
                "jamb_or_wall": jamb_or_wall_val,
                "jamb_size": (d.get("jamb_size") or "112×19mm 5.4m Loose Jamb") if is_loose else None,
                "hung": hung_val,
                "type": clean_type,
                "door_stop": d.get("door_stop") or ("DS2 with Riser" if is_ext else "Cushion"),
                "internal_type": d.get("internal_type") or (None if is_ext else ("HL" if is_bun_vic else "HF")),
                "color": d.get("color") or (None if is_ext else "CHR"),
                "default_qty": 1
            }
        else:
            grouped[key]["default_qty"] += 1

    return {
        "success": True,
        "rows": list(grouped.values())
    }
