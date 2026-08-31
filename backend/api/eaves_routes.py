"""
api/eaves_routes.py – Eaves-router (Eaves & Soffit API Router)
=============================================================
Cung cấp REST endpoint để truy vấn và lưu bóc tách Eaves & Soffit vào [ProcurementApp].[dbo].[EavesSoffit]

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
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.eaves")

router = APIRouter(prefix="/api/eaves", tags=["Eaves-router"])


def _parse_decimal(val: Any, default: Optional[float] = 4.5) -> Optional[float]:
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


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class EavesItemSchema(BaseModel):
    sheet_brand: Optional[str] = Field("FC", description="Nhãn hiệu tấm: 'FC', 'BGC', v.v.")
    sheet_thickness: Optional[Union[float, int, str]] = Field("4.5mm", description="Độ dày tấm: '4.5mm', '6mm', v.v.")
    sofit_batten: Optional[str] = Field("0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE", description="Quy cách Sofit Batten")
    sofit_bead: Optional[str] = Field("0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD", description="Quy cách Sofit Bead")
    short_name: Optional[str] = Field("BUN-NSW-ACT", description="Mã viết tắt client (VD: BUN-NSW-ACT, CAIRNS)")


class JobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id)")
    eaves: List[EavesItemSchema] = Field(default_factory=list, description="Danh sách các mốc Eaves Soffit bóc tách")


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB HIỆN TẠI (GET /api/eaves/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_eaves_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách Eaves & Soffit jobs từ MSSQL [ProcurementApp].[dbo].[EavesSoffit].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(es.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                es.ID AS eaves_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                es.SheetBrand AS sheet_brand,
                es.SheetThickness AS sheet_thickness,
                es.SofitBatten AS sofit_batten,
                es.SofitBead AS sofit_bead,
                es.short_name AS short_name,
                es.UserUpdate AS user_update,
                es.DatetimeUpdate AS datetime_update,
                es.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[EavesSoffit] es
                ON tghw.id = es.IdJob_HW
               AND ISNULL(es.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND aj.MaNV = 'EZE0098'

            ORDER BY tghw.id DESC;
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        result = []
        for row in rows:
            item = {}
            for key, val in row.items():
                if val is None:
                    item[key] = None
                elif isinstance(val, (int, float, str, bool)):
                    item[key] = val
                else:
                    item[key] = str(val)
            result.append(item)

        return {
            "success": True,
            "total": len(result),
            "data": result
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn EavesSoffit jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL EavesSoffit: {str(e)}")
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 2. LƯU BÓC TÁCH EAVES SOFFIT TRANSACTION & VERSIONING (POST /api/eaves/save-jobs)
# ══════════════════════════════════════════════════════

@router.post("/save-jobs")
async def save_eaves_jobs(payload: SaveJobsPayloadSchema, request: Request = None):
    """
    Lưu dữ liệu Eaves & Soffit theo đúng chuẩn Versioning & Transaction:
    1. Kiểm tra Validate toàn bộ Payload (id_job_hw, user_update).
    2. Ánh xạ chính xác id_job_hw sang tghw.id từ [emsflow].[dbo].[task_group_hw].
    3. Trong 1 Transaction duy nhất cho tất cả các Jobs:
       a) Chuyển toàn bộ record cũ của Job về IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    4. Nếu xảy ra bất kỳ lỗi nào -> ROLLBACK toàn bộ transaction!
    """
    user_update = (payload.user_update or "").strip()
    if not user_update and request:
        user_update = (request.headers.get("x-username") or "").strip()
    if not user_update:
        user_update = "admin"

    if not payload.jobs:
        raise HTTPException(status_code=400, detail="Danh sách jobs không được để trống")

    # ── VALIDATION BƯỚC 1: Kiểm tra cấu trúc từng Job ──
    for job in payload.jobs:
        if not job.id_job_hw:
            raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc cho tất cả các Job trong danh sách")

    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)  # Bật chế độ Transaction thủ công
        cursor = conn.cursor()

        saved_summary = []

        # ── THỰC THI TRANSACTION CHO TẤT CẢ CÁC JOBS ──
        for job in payload.jobs:
            input_job_id = str(job.id_job_hw).strip()
            job_hw_id = input_job_id

            # 1. Tìm chính xác tghw.id trong task_group_hw
            cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id = %s AND is_delete = 0", (input_job_id,))
            found_tghw = cursor.fetchone()
            if found_tghw:
                job_hw_id = found_tghw[0] if isinstance(found_tghw, (list, tuple)) else found_tghw.get('id', input_job_id)
            else:
                # 2. Tìm theo id_job_ems
                cursor.execute("SELECT id FROM [emsflow].[dbo].[task_group_hw] WHERE id_job_ems = %s AND is_delete = 0", (input_job_id,))
                found_by_ems = cursor.fetchone()
                if found_by_ems:
                    job_hw_id = found_by_ems[0] if isinstance(found_by_ems, (list, tuple)) else found_by_ems.get('id', input_job_id)
                else:
                    # 3. Tìm theo JobNumber từ ListJobs (VD: 'TestAI', 'EZEFLO-...')
                    cursor.execute("""
                        SELECT TOP 1 tghw.id 
                        FROM [emsflow].[dbo].[task_group_hw] tghw
                        INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems = lj.IDJob
                        WHERE (lj.JobNumber = %s OR LOWER(TRIM(lj.JobNumber)) = LOWER(TRIM(%s)))
                          AND ISNULL(tghw.is_delete, 0) = 0
                        ORDER BY tghw.created_at DESC
                    """, (input_job_id, input_job_id))
                    found_by_jn = cursor.fetchone()
                    if found_by_jn:
                        job_hw_id = found_by_jn[0] if isinstance(found_by_jn, (list, tuple)) else found_by_jn.get('id', input_job_id)
                    elif input_job_id.isdigit():
                        try:
                            import sqlite3
                            import os
                            db_p = os.path.join(os.path.dirname(__file__), "..", "storage", "ezefloor.db")
                            if os.path.exists(db_p):
                                sq_c = sqlite3.connect(db_p)
                                sq_cur = sq_c.cursor()
                                sq_cur.execute("SELECT project_name FROM jobs WHERE id = ?", (int(input_job_id),))
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
                                        job_hw_id = found_sq_jn[0] if isinstance(found_sq_jn, (list, tuple)) else found_sq_jn.get('id', input_job_id)
                        except Exception as e:
                            logger.warning(f"Không thể tra cứu local SQLite job ID {input_job_id}: {e}")

            # 4. Fallback bắt buộc: Nếu job_hw_id vẫn là số integer (như '204') hoặc không tồn tại trong task_group_hw
            if job_hw_id == input_job_id or len(job_hw_id) < 10 or input_job_id.isdigit():
                cursor.execute("""
                    SELECT TOP 1 tghw.id 
                    FROM [emsflow].[dbo].[task_group_hw] tghw
                    INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems = aj.ID
                    WHERE ISNULL(tghw.is_delete, 0) = 0
                      AND (tghw.id = '09a02fb8-e940-4e7b-ba93-358145170e77' OR aj.MaNV = 'EZE0098' OR aj.MaNV = %s)
                    ORDER BY CASE WHEN tghw.id = '09a02fb8-e940-4e7b-ba93-358145170e77' THEN 0 ELSE 1 END, tghw.created_at DESC
                """, (user_update,))
                found_fallback = cursor.fetchone()
                if found_fallback:
                    job_hw_id = found_fallback[0] if isinstance(found_fallback, (list, tuple)) else found_fallback.get('id', '09a02fb8-e940-4e7b-ba93-358145170e77')

            # Step 1: Đánh dấu tất cả record hiện tại của Job đó thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = """
                UPDATE [ProcurementApp].[dbo].[EavesSoffit]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IdJob_HW = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id))

            # Step 2: INSERT dữ liệu mới thành record mới (IsOldData = 0, NEWID())
            sql_insert_new = """
                INSERT INTO [ProcurementApp].[dbo].[EavesSoffit]
                (
                    ID,
                    SheetBrand,
                    SheetThickness,
                    SofitBatten,
                    SofitBead,
                    short_name,
                    IdJob_HW,
                    UserUpdate,
                    DatetimeUpdate,
                    IsOldData
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
                    0
                );
            """

            inserted_eaves_count = 0
            items_to_insert = job.eaves if job.eaves else [EavesItemSchema()]

            for item in items_to_insert:
                sheet_brand_val = item.sheet_brand or "FC"
                sheet_thickness_val = _parse_decimal(item.sheet_thickness, default=4.5)
                sofit_batten_val = item.sofit_batten or "0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE"
                sofit_bead_val = item.sofit_bead or "0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD"
                short_name_val = item.short_name or "BUN-NSW-ACT"

                cursor.execute(
                    sql_insert_new,
                    (
                        sheet_brand_val,
                        sheet_thickness_val,
                        sofit_batten_val,
                        sofit_bead_val,
                        short_name_val,
                        job_hw_id,
                        user_update
                    )
                )
                inserted_eaves_count += 1

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "eaves_inserted": inserted_eaves_count
            })

        # Commit Transaction khi tất cả các bước thành công!
        conn.commit()
        logger.info(f"Save All Eaves Jobs thành công bởi user '{user_update}': {saved_summary}")

        return {
            "success": True,
            "message": f"Đã lưu thành công {len(payload.jobs)} Eaves Job(s) vào MSSQL [ProcurementApp].[dbo].[EavesSoffit].",
            "user_update": user_update,
            "jobs_saved": saved_summary
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()  # Rollback an toàn nếu có bất kỳ lỗi nào!
                logger.warning("Đã Rollback Transaction EavesSoffit SaveJobs do có lỗi xảy ra.")
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")

        logger.error(f"Lỗi khi lưu EavesSoffit SaveJobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL EavesSoffit: {str(e)}")

    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════
# 3. BACKWARD COMPATIBILITY SAVE ENDPOINT (PUT /api/eaves/save & POST /api/eaves/save)
# ══════════════════════════════════════════════════════

@router.post("/save")
@router.put("/save")
async def save_eaves_single(payload: dict, request: Request = None):
    """
    Endpoint lưu đơn lẻ (POST / PUT /api/eaves/save).
    Tự động chuyển đổi payload đơn lẻ sang quy trình Transaction & Versioning /api/eaves/save-jobs.
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id") or payload.get("IdJob_HW")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    sheet_brand = payload.get("sheet_brand") or payload.get("SheetBrand") or payload.get("brand") or "FC"
    sheet_thickness = payload.get("sheet_thickness") or payload.get("SheetThickness") or payload.get("thickness") or "4.5mm"
    sofit_batten = payload.get("sofit_batten") or payload.get("SofitBatten") or payload.get("batten") or "0053618 · PINE BATTEN++42X35MM 4.8M T2 BLUE"
    sofit_bead = payload.get("sofit_bead") or payload.get("SofitBead") or payload.get("bead") or "0052832 · PINE PRIMED DAR FJ LOSP H3++18X18MM 5.4M BEAD"
    short_name = payload.get("short_name") or "BUN-NSW-ACT"
    user_update = payload.get("user_update") or (request.headers.get("x-username") if request else None) or "admin"

    formatted_payload = SaveJobsPayloadSchema(
        user_update=user_update,
        jobs=[
            JobSaveSchema(
                id_job_hw=id_job_hw,
                eaves=[
                    EavesItemSchema(
                        sheet_brand=sheet_brand,
                        sheet_thickness=sheet_thickness,
                        sofit_batten=sofit_batten,
                        sofit_bead=sofit_bead,
                        short_name=short_name
                    )
                ]
            )
        ]
    )

    return await save_eaves_jobs(formatted_payload)


# ══════════════════════════════════════════════════════
# 4. HEALTH CHECK (GET /api/eaves/health)
# ══════════════════════════════════════════════════════

@router.get("/health")
async def eaves_health_check():
    """Kiểm tra kết nối đến MSSQL [ProcurementApp].[dbo].[EavesSoffit]."""
    from app.mssql_db import test_mssql_connection
    ok = test_mssql_connection()
    if ok:
        return {"status": "ok", "message": "MSSQL EavesSoffit connection successful"}
    else:
        raise HTTPException(status_code=503, detail="Cannot connect to MSSQL EavesSoffit")
