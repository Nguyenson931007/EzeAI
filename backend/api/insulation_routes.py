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
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

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
async def get_insulation_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách Insulation jobs từ MSSQL [ProcurementApp].[dbo].[Insulation].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(ins.IsOldData, 0) = 0.
    Trả về wall_length theo đơn vị mm, diện tích m².
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                ins.ID AS insulation_id,
                tghw.id AS IdJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                ins.InsulationType AS insulation_type,
                ins.InsulationType AS wall_type,
                ins.Product AS product,
                ins.WallHeight AS wall_height,
                ins.WallLength AS wall_length,
                ins.TotalAreaRaked AS total_area_raked,
                ins.TotalAreaDoor AS total_area_door,
                ins.RValue AS r_value,
                ins.short_name AS short_name,
                ins.UserUpdate AS user_update,
                ins.DatetimeUpdate AS datetime_update,
                ins.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[Insulation] ins
                ON tghw.id = ins.IdJob_HW
               AND ISNULL(ins.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND aj.MaNV = 'EZE0098'

            ORDER BY tghw.id DESC, ins.ID DESC;
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        formatted_rows = []
        for r in rows:
            raw_len = float(r["wall_length"]) if r.get("wall_length") is not None else 0.0
            wall_len_mm = raw_len * 1000.0 if 0 < raw_len < 1000.0 else raw_len

            raw_r = r.get("r_value")
            r_val_formatted = f"R{float(raw_r):.1f}" if raw_r is not None else "R2.0"

            formatted_rows.append({
                "insulation_id": str(r.get("insulation_id")) if r.get("insulation_id") else None,
                "IdJob_HW": r.get("IdJob_HW"),
                "hw_id": r.get("hw_id"),
                "job_number": r.get("job_number"),
                "insulation_type": r.get("insulation_type"),
                "wall_type": r.get("wall_type") or r.get("insulation_type"),
                "product": r.get("product"),
                "wall_height": float(r["wall_height"]) if r.get("wall_height") is not None else 0.0,
                "wall_length": round(wall_len_mm, 4),
                "total_area_raked": float(r["total_area_raked"]) if r.get("total_area_raked") is not None else 0.0,
                "total_area_door": float(r["total_area_door"]) if r.get("total_area_door") is not None else 0.0,
                "r_value": r_val_formatted,
                "short_name": r.get("short_name") or "BUN-NSW-ACT",
                "user_update": r.get("user_update"),
                "datetime_update": r["datetime_update"].isoformat() if r.get("datetime_update") else None,
                "is_old_data": r.get("is_old_data", 0)
            })

        logger.info(f"Lấy thành công {len(formatted_rows)} bản ghi Insulation [ProcurementApp] cho User 'EZE0098'.")
        return {
            "success": True,
            "total": len(formatted_rows),
            "data": formatted_rows
        }

    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách Insulation Jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL Insulation: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH INSULATION VÀO MSSQL (POST /api/insulation/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_insulation_jobs(payload: SaveInsulationJobsPayloadSchema):
    """
    Lưu danh sách bóc tách Insulation vào [ProcurementApp].[dbo].[Insulation].
    Lưu WallHeight, WallLength (mm), RValue (decimal).
    Thực hiện hoàn toàn trong DATABASE TRANSACTION với IsOldData versioning.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = payload.user_update or "EZE0098"
        saved_summary = []

        sql_archive_old = """
            UPDATE [ProcurementApp].[dbo].[Insulation]
            SET
                IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE
                IdJob_HW = %s
                AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[Insulation]
            (
                ID,
                InsulationType,
                Product,
                WallHeight,
                WallLength,
                RValue,
                IdJob_HW,
                UserUpdate,
                DatetimeUpdate,
                IsOldData,
                short_name,
                TotalAreaRaked,
                TotalAreaDoor
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
                0,
                %s,
                %s,
                %s
            );
        """

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            job_hw_id = raw_id

            # Ánh xạ input_job_id sang chính xác tghw.id trong task_group_hw (giống FrameWork & AreaSummary)
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

            # 2. Thêm mới các mốc insulation hiện tại (IsOldData = 0)
            inserted_count = 0
            for item in job.items:
                itype = item.insulation_type or item.wall_type or "Ext wall"
                h = float(item.wall_height or 2400.0)
                l = float(item.wall_length or 0.0)
                raked = float(item.total_area_raked or 0.0)
                door = float(item.total_area_door or 0.0)



                # Parse RValue sang số thập phân (e.g. "R2.5" -> 2.5)
                r_val_raw = str(item.r_value if item.r_value is not None else "2.0").upper().replace("R", "").strip()
                try:
                    r_val = float(r_val_raw)
                except Exception:
                    r_val = 2.0

                prod = (item.product or "").strip()
                short_nm = (item.short_name or "BUN-NSW-ACT").strip()

                cursor.execute(
                    sql_insert_new,
                    (
                        itype,
                        prod,
                        round(h, 2),
                        round(l, 2),
                        round(r_val, 2),
                        job_hw_id,
                        user_update,
                        short_nm,
                        round(raked, 2),
                        round(door, 2)
                    )
                )
                inserted_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "inserted": inserted_count
            })

        # Commit Transaction khi tất cả các bước thành công
        conn.commit()
        logger.info(f"Save Insulation vào [ProcurementApp] thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Job(s) vào [ProcurementApp].[dbo].[Insulation].",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                logger.warning("Đã Rollback Transaction Insulation do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL Insulation: {rb_err}")

        logger.error(f"Lỗi khi lưu Insulation: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu Insulation MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. TÍNH TOÁN DIỆN TÍCH INSULATION (POST /api/insulation/calculate)
# ══════════════════════════════════════════════════════

class DoorOnWallSchema(BaseModel):
    width_mm: float = Field(820.0, description="Chiều rộng cửa (mm)")
    height_mm: float = Field(2040.0, description="Chiều cao cửa (mm)")


class WallForCalcSchema(BaseModel):
    id: Optional[str] = Field(None, description="Wall ID (tùy chọn)")
    class_name: Optional[str] = Field("exterior_wall", description="Loại tường: exterior_wall, interior_wall, partition_wall")
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
    Tính toán diện tích Insulation cho từng tường, sau đó gộp theo (WallType, WallHeight).
    WallLength được trả về dưới dạng mm.

    Công thức (tính 1 MẶT duy nhất):
      - S_wall  = (wall_height_mm / 1000) × (wall_length_mm / 1000)   [m²]
      - S_door  = Σ (door_width_mm / 1000) × (door_height_mm / 1000) cho tất cả cửa trên tường đó  [m²]
      - total_area_raked = 0.0 (mặc định)
      - total_area_door  = S_door                            [m²]

    Kết quả được gộp theo cặp (wall_type, wall_height) → cộng dồn wall_length (mm), total_area_raked, total_area_door.
    Mỗi hàng bao gồm danh sách chi tiết chi tiết chia theo từng tầng (page_breakdown).
    """
    try:
        # Dict key = (wall_type, wall_height_mm) → aggregated values & page breakdowns
        groups = defaultdict(lambda: {
            "wall_length": 0.0,
            "total_area_raked": 0.0,
            "total_area_door": 0.0,
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

            key = (wall_type, height_mm)
            groups[key]["wall_length"] += length_mm
            groups[key]["total_area_raked"] += total_area_raked
            groups[key]["total_area_door"] += s_door

            # Track page/floor breakdown
            pg = groups[key]["page_groups"][page_name]
            pg["wall_length"] += length_mm
            pg["total_area_raked"] += total_area_raked
            pg["total_area_door"] += s_door

        # Build result rows, sorted by wall_type then height
        rows = []
        for (wt, hm), vals in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1])):
            page_breakdown = []
            for p_name, p_vals in vals["page_groups"].items():
                page_breakdown.append({
                    "page_name": p_name,
                    "wall_length": round(p_vals["wall_length"], 4),
                    "total_area_raked": round(p_vals["total_area_raked"], 2),
                    "total_area_door": round(p_vals["total_area_door"], 2)
                })

            rows.append({
                "wall_type": wt,
                "wall_height": round(hm, 1),
                "wall_length": round(vals["wall_length"], 4),
                "total_area_raked": round(vals["total_area_raked"], 2),
                "total_area_door": round(vals["total_area_door"], 2),
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
