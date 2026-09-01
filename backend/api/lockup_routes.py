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
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.lockup")

router = APIRouter(prefix="/api/lockout")


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class LockoutItemSchema(BaseModel):
    mode: Optional[str] = Field(None, description="Mode (e.g. Prehung, Loose...)")
    scope: Optional[str] = Field(None, description="Scope (e.g. external, internal...)")
    label: Optional[str] = Field(None, description="Nhãn cửa (e.g. Entry Door, Bedroom Door...)")
    door_name: Optional[str] = Field(None, description="Tên cửa (e.g. D-101, D-201...)")
    height: Optional[Union[float, int]] = Field(None, description="Chiều cao cửa (mm)")
    width: Optional[Union[float, int]] = Field(None, description="Chiều rộng cửa (mm)")
    thickness: Optional[Union[float, int]] = Field(None, description="Độ dày cửa (mm)")
    jamb_or_wall: Optional[str] = Field(None, description="Jamb or Wall (e.g. 90mm Wall, Steel Frame...)")
    jamb_size: Optional[str] = Field(None, description="Kích thước Jamb (e.g. 112x19mm...)")
    hung: Optional[str] = Field(None, description="Hướng mở hung (Hung A, Hung B...)")
    door_type: Optional[str] = Field(None, description="Loại cửa (Type A, Type CG...)")
    door_stop: Optional[str] = Field(None, description="Chặn cửa door_stop (Cushion, DS2 with Riser...)")
    internal_type: Optional[str] = Field(None, description="Internal type (HF, HO...)")
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
# 1. TRUY VẤN CÁC JOB LOCKUP HIỆN TẠI (GET /api/lockout/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_lockout_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách LockUp jobs từ MSSQL [ProcurementApp].[dbo].[LockUp].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(lock.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                lock.ID AS lockout_id,
                tghw.id AS IdJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                lock.[mode],
                lock.[scope],
                lock.label,
                lock.door_name,
                lock.height,
                lock.width,
                lock.thickness,
                lock.jamb_or_wall,
                lock.jamb_size,
                lock.hung,
                lock.door_type,
                lock.door_stop,
                lock.internal_type,
                lock.color,
                lock.default_qty,
                lock.short_name,
                lock.UserUpdate AS user_update,
                lock.DatetimeUpdate AS datetime_update,
                lock.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[LockUp] lock
                ON tghw.id = lock.IdJob_HW
               AND ISNULL(lock.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND aj.MaNV = 'EZE0098'

            ORDER BY tghw.id DESC, lock.ID DESC;
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        formatted_rows = []
        for r in rows:
            formatted_rows.append({
                "lockout_id": str(r.get("lockout_id")) if r.get("lockout_id") else None,
                "IdJob_HW": r.get("IdJob_HW"),
                "hw_id": r.get("hw_id"),
                "job_number": r.get("job_number"),
                "mode": r.get("mode"),
                "scope": r.get("scope"),
                "label": r.get("label"),
                "door_name": r.get("door_name"),
                "height": float(r["height"]) if r.get("height") is not None else None,
                "width": float(r["width"]) if r.get("width") is not None else None,
                "thickness": float(r["thickness"]) if r.get("thickness") is not None else None,
                "jamb_or_wall": r.get("jamb_or_wall"),
                "jamb_size": str(r["jamb_size"]) if r.get("jamb_size") is not None else None,
                "hung": r.get("hung"),
                "door_type": r.get("door_type"),
                "door_stop": r.get("door_stop"),
                "internal_type": r.get("internal_type"),
                "color": r.get("color"),
                "default_qty": float(r["default_qty"]) if r.get("default_qty") is not None else 1.0,
                "short_name": r.get("short_name") or "BUN-NSW-ACT",
                "user_update": r.get("user_update"),
                "datetime_update": str(r.get("datetime_update")) if r.get("datetime_update") else None,
                "is_old_data": bool(r.get("is_old_data", 0))
            })

        return {
            "success": True,
            "count": len(formatted_rows),
            "data": formatted_rows
        }

    except Exception as e:
        logger.error(f"Error fetching LockUp jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi tải LockUp Jobs: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH LOCKUP VÀO MSSQL (POST /api/lockout/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_lockout_jobs(payload: SaveLockoutJobsPayloadSchema):
    """
    Lưu danh sách bóc tách LockUp của nhiều Jobs vào MSSQL CSDL [ProcurementApp].[dbo].[LockUp].
    Thực hiện hoàn toàn trong DATABASE TRANSACTION với IsOldData versioning.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = payload.user_update or "EZE0098"
        saved_summary = []

        sql_archive_old = """
            UPDATE [ProcurementApp].[dbo].[LockUp]
            SET
                IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE
                IdJob_HW = %s
                AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[LockUp]
            (
                ID,
                [mode],
                [scope],
                label,
                door_name,
                height,
                width,
                thickness,
                jamb_or_wall,
                jamb_size,
                hung,
                door_type,
                door_stop,
                internal_type,
                color,
                default_qty,
                IdJob_HW,
                UserUpdate,
                DatetimeUpdate,
                IsOldData,
                short_name
            )
            VALUES
            (
                NEWID(),
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, GETDATE(), 0, %s
            );
        """

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            job_hw_id = raw_id

            # Ánh xạ input_job_id sang chính xác tghw.id trong task_group_hw (giống FrameWork & AreaSummary & Insulation)
            cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id = %s AND is_delete = 0", (raw_id,))
            found_tghw = cursor.fetchone()
            if found_tghw:
                job_hw_id = found_tghw[0] if isinstance(found_tghw, (list, tuple)) else found_tghw.get('id', raw_id)
            else:
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
                    try:
                        import sqlite3, os
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
                    except Exception:
                        pass

            # 1. Chuyển các bản ghi cũ của Job này thành IsOldData = 1
            cursor.execute(sql_archive_old, (user_update, job_hw_id))

            # 2. Thêm mới các mốc LockUp hiện tại (IsOldData = 0)
            inserted_count = 0
            for item in job.items:
                short_nm = item.short_name or "BUN-NSW-ACT"
                cursor.execute(
                    sql_insert_new,
                    (
                        item.mode,
                        item.scope,
                        item.label,
                        item.door_name,
                        item.height,
                        item.width,
                        item.thickness,
                        item.jamb_or_wall,
                        item.jamb_size,
                        item.hung,
                        item.door_type,
                        item.door_stop,
                        item.internal_type,
                        item.color,
                        item.default_qty or 1.0,
                        job_hw_id,
                        user_update,
                        short_nm
                    )
                )
                inserted_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "inserted": inserted_count
            })

        # Commit Transaction khi tất cả các bước thành công
        conn.commit()
        logger.info(f"Save LockUp thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Job(s) vào MSSQL [ProcurementApp].[dbo].[LockUp].",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error saving LockUp jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu dữ liệu LockUp: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. TÍNH TOÁN LOCKOUT TỪ CỬA CANVAS (POST /api/lockout/calculate)
# ══════════════════════════════════════════════════════

class DoorCalcPayload(BaseModel):
    doors: List[Any] = Field(default_factory=list, description="Danh sách các cửa từ Canvas")


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

        d_name = d.get("door_name") or d.get("doorName") or f"D-{idx + 1}"
        d_width = float(d.get("width_mm") or d.get("width") or 820.0)
        d_height = float(d.get("height_mm") or d.get("height") or 2040.0)

        # 1. Scope: Lấy theo Door Type (External vs Internal Penetrations)
        raw_type = str(
            d.get("door_type") or 
            d.get("doorType") or 
            d.get("doorTypeId") or 
            d.get("label") or 
            d.get("type") or 
            d.get("classification") or ""
        ).lower()

        ext_keywords = ["external", "ext_", "garage"]
        if any(kw in raw_type for kw in ext_keywords):
            scope_val = "external"
        else:
            scope_val = "internal"

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

        # 3. Hinge Side -> Hung (Hung A cho LH - Left Hand, Hung B cho RH - Right Hand)
        hinge_side = str(d.get("hingeSide") or d.get("hinge_side") or d.get("hinge") or d.get("hung") or "").lower()
        if "hung a" in hinge_side or "lh" in hinge_side or "left" in hinge_side:
            hung_val = "Hung A"
        elif "hung b" in hinge_side or "rh" in hinge_side or "right" in hinge_side:
            hung_val = "Hung B"
        elif "hung cg" in hinge_side:
            hung_val = "Hung CG"
        elif "hung dg" in hinge_side:
            hung_val = "Hung DG"
        elif "hung g" in hinge_side:
            hung_val = "Hung G"
        elif "pivot" in hinge_side:
            hung_val = "Pivot Door"
        elif "double" in hinge_side:
            hung_val = "Double Door Set"
        else:
            hung_val = None

        d_label = str(d.get("label") or d.get("name") or d_name).strip()
        is_ext = scope_val == "external"

        key = f"{d_name}_{d_width}_{d_height}_{scope_val}_{jamb_or_wall_val}_{hung_val}"
        if key not in grouped:
            grouped[key] = {
                "mode": None,
                "scope": scope_val,
                "label": d_label,
                "door_name": d_name,
                "height": d_height,
                "width": d_width,
                "thickness": float(d.get("thickness") or d.get("thickness_mm") or (40.0 if is_ext else 35.0)),
                "jamb_or_wall": jamb_or_wall_val,
                "jamb_size": d.get("jamb_size") or "112×19mm 5.4m",
                "hung": hung_val or "Hung A",
                "door_type": d.get("door_type") or ("Type CG" if is_ext else "Type A"),
                "door_stop": d.get("door_stop") or ("DS2 with Riser" if is_ext else "Cushion"),
                "internal_type": d.get("internal_type") or (None if is_ext else "HF"),
                "color": d.get("color") or (None if is_ext else "CHR"),
                "default_qty": 1
            }
        else:
            grouped[key]["default_qty"] += 1

    return {
        "success": True,
        "rows": list(grouped.values())
    }
