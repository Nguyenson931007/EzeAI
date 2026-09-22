

import json
import logging
import re
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection
from app.customer_modules.bun_nsw_act.calculators import calculate_eaves
from app.customer_modules.base import CustomerCalculationError

logger = logging.getLogger("ezefloor.eaves")

router = APIRouter(prefix="/api/eaves", tags=["Eaves-router"])


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


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class EavesItemSchema(BaseModel):
    # All setup values are required.  Silently manufacturing FC/BUN defaults
    # here can attach plausible-looking but incorrect data to a job.
    sheet_brand: str = Field(..., min_length=1, description="Nhãn hiệu tấm từ DB")
    sheet_thickness: Union[float, int, str] = Field(..., description="Độ dày tấm từ DB")
    sofit_batten: str = Field(..., min_length=1, description="Quy cách Sofit Batten từ DB")
    sofit_bead: str = Field(..., min_length=1, description="Quy cách Sofit Bead từ DB")
    short_name: str = Field(..., min_length=1, description="Mã viết tắt client từ DB")
    floor_level: Optional[str] = Field("GF", description="Tầng: GF, FF, SF, TF...")
    input_data: dict[str, Any] = Field(default_factory=dict, description="Raw Eaves/Soffit manual inputs used by Procurement")


class JobSaveSchema(BaseModel):
    id_job_hw: str = Field(..., min_length=1, description="ID HW Job (tghw.id), IDJob EMS hoặc JobNumber")
    eaves: List[EavesItemSchema] = Field(
        ...,
        min_length=1,
        description="Danh sách các setup Eaves/Soffit hiện hành cho mỗi job",
    )


class SaveJobsPayloadSchema(BaseModel):
    user_update: str = Field(..., min_length=1, description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[JobSaveSchema] = Field(..., min_length=1, description="Danh sách các Job cần lưu")



EAVES_INPUT_KEYS = {
    "eaves_450", "eaves_600", "eaves_750", "eaves_900",
    "single_1800", "single_2100", "single_2400", "single_2700", "single_3000",
    "double_1800", "double_2100", "double_2400", "double_2700", "double_3000",
    "multi_1800", "multi_2100", "multi_2400", "multi_2700", "multi_3000",
    "extra_batten", "extra_bead", "metal_batten_m2",
}

def _normalize_input_data(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, float] = {}
    for key in EAVES_INPUT_KEYS:
        raw = value.get(key)
        if raw is None or str(raw).strip() == "":
            continue
        parsed = _parse_decimal(raw)
        if parsed is None or parsed < 0:
            raise HTTPException(status_code=422, detail=f"Invalid Eaves/Soffit input '{key}'.")
        result[key] = parsed
    return result


def _row_value(row: Any, key: str, index: int) -> Any:
    if isinstance(row, dict):
        return row.get(key)
    return row[index]


def _resolve_job(cursor: Any, input_job_id: str) -> tuple[str, str]:
    """Resolve a job only from authoritative MSSQL data.

    An ambiguous IDJob/JobNumber is rejected instead of guessing a hardware
    group.  The returned short name is also authoritative and is used to
    validate the client supplied in the save payload.
    """
    base_select = """
        SELECT TOP 2
            CAST(tghw.id AS nvarchar(100)) AS id,
            UPPER(LTRIM(RTRIM(COALESCE(NULLIF(lc.ShortName, ''), lj.Client)))) AS short_name
        FROM [emsflow].[dbo].[task_group_hw] AS tghw
        INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] AS lj
            ON tghw.id_job_ems = lj.IDJob
           AND ISNULL(lj.IsDelete, 0) = 0
        LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] AS lc
            ON lc.ClientName = lj.Client
           AND ISNULL(lc.IsDelete, 0) = 0
        WHERE ISNULL(tghw.is_delete, 0) = 0
          AND {condition}
        ORDER BY tghw.created_at DESC, tghw.id
    """
    lookups = (
        ("CAST(tghw.id AS nvarchar(100)) = %s", (input_job_id,)),
        ("CAST(tghw.id_job_ems AS nvarchar(100)) = %s", (input_job_id,)),
        ("LOWER(LTRIM(RTRIM(lj.JobNumber))) = LOWER(LTRIM(RTRIM(%s)))", (input_job_id,)),
    )
    for condition, params in lookups:
        cursor.execute(base_select.format(condition=condition), params)
        rows = cursor.fetchall()
        if not rows:
            continue
        if len(rows) > 1:
            raise HTTPException(
                status_code=409,
                detail=f"Job '{input_job_id}' maps to multiple hardware groups; send the exact id_job_hw.",
            )
        row = rows[0]
        job_hw_id = str(_row_value(row, "id", 0) or "").strip()
        short_name = str(_row_value(row, "short_name", 1) or "").strip().upper()
        if not job_hw_id or not short_name:
            raise HTTPException(status_code=422, detail="The resolved job has no valid hardware ID or client short name.")
        return job_hw_id, short_name

    raise HTTPException(status_code=404, detail=f"Job '{input_job_id}' was not found in MSSQL.")



# ══════════════════════════════════════════════════════
# PROCUREMENT-PARITY CALCULATION (READ ONLY)
# ══════════════════════════════════════════════════════

@router.post("/calculate")
async def calculate_eaves_procurement(payload: dict[str, Any]):
    """Calculate the BUN NSW/ACT Eaves & Soffits schedule.

    This endpoint is read-only. It performs no database INSERT/UPDATE/DELETE.
    The calculation function is the same Procurement-parity calculator used by
    the BUN NSW/ACT customer module.
    """
    try:
        return {"success": True, "data": calculate_eaves(payload or {})}
    except CustomerCalculationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Eaves/Soffit calculation failed")
        raise HTTPException(status_code=500, detail=f"Eaves/Soffit calculation failed: {exc}")


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

        normalized_office = (office or "").strip().upper() or None
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
                es.FloorLevel AS floor_level,
                es.UserUpdate AS user_update,
                es.DatetimeUpdate AS datetime_update,
                es.IsOldData AS is_old_data,
                es.InputDataJson AS input_data_json,

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
                AND (%s IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV))) = %s)

            ORDER BY tghw.id DESC;
        """

        cursor.execute(sql, (normalized_office, normalized_office))
        rows = cursor.fetchall()

        result = []
        for row in rows:
            item = {}
            for key, val in row.items():
                if key == "input_data_json":
                    continue
                if val is None:
                    item[key] = None
                elif isinstance(val, (int, float, str, bool)):
                    item[key] = val
                else:
                    item[key] = str(val)
            item["floor_level"] = row.get("floor_level") or "GF"
            raw_input_data = row.get("input_data_json")
            try:
                item["input_data"] = json.loads(raw_input_data) if raw_input_data else {}
            except (TypeError, ValueError):
                item["input_data"] = {}
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
async def save_eaves_jobs(payload: SaveJobsPayloadSchema):
    """
    Lưu dữ liệu Eaves & Soffit theo đúng chuẩn Versioning & Transaction:
    1. Kiểm tra Validate toàn bộ Payload (id_job_hw, user_update).
    2. Ánh xạ chính xác id_job_hw sang tghw.id từ [emsflow].[dbo].[task_group_hw].
    3. Trong 1 Transaction duy nhất cho tất cả các Jobs:
       a) Chuyển toàn bộ record cũ của Job về IsOldData = 1.
       b) INSERT toàn bộ record mới với NEWID() và IsOldData = 0.
    4. Nếu xảy ra bất kỳ lỗi nào -> ROLLBACK toàn bộ transaction!
    """
    user_update = payload.user_update.strip()
    if not user_update:
        raise HTTPException(status_code=422, detail="user_update là bắt buộc")

    # ── VALIDATION BƯỚC 1: Kiểm tra cấu trúc từng Job ──
    input_job_ids: set[str] = set()
    for job in payload.jobs:
        input_job_id = job.id_job_hw.strip()
        if not input_job_id:
            raise HTTPException(status_code=422, detail="id_job_hw là bắt buộc cho tất cả các Job trong danh sách")
        normalized_id = input_job_id.lower()
        if normalized_id in input_job_ids:
            raise HTTPException(status_code=422, detail=f"Job '{input_job_id}' appears more than once in the payload.")
        input_job_ids.add(normalized_id)

    conn = None
    try:
        conn = get_mssql_connection()
        conn.autocommit(False)  # Bật chế độ Transaction thủ công
        cursor = conn.cursor()

        saved_summary = []

        # ── THỰC THI TRANSACTION CHO TẤT CẢ CÁC JOBS ──
        for job in payload.jobs:
            input_job_id = job.id_job_hw.strip()
            job_hw_id, authoritative_short_name = _resolve_job(cursor, input_job_id)
            first_item = job.eaves[0]
            short_name_val = first_item.short_name.strip().upper()

            # Range-lock this job/client so concurrent requests cannot both
            # create a current row.
            cursor.execute("""
                SELECT ID
                FROM [ProcurementApp].[dbo].[EavesSoffit] WITH (UPDLOCK, HOLDLOCK)
                WHERE IdJob_HW = %s
                  AND UPPER(LTRIM(RTRIM(ISNULL(short_name, '')))) = %s;
            """, (job_hw_id, short_name_val))
            cursor.fetchall()

            # Step 1: Đánh dấu tất cả record hiện tại của Job đó thành dữ liệu lịch sử (IsOldData = 1)
            sql_update_history = """
                UPDATE [ProcurementApp].[dbo].[EavesSoffit]
                SET
                    IsOldData = 1,
                    UserUpdate = %s,
                    DatetimeUpdate = GETDATE()
                WHERE IdJob_HW = %s
                  AND UPPER(LTRIM(RTRIM(ISNULL(short_name, '')))) = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """
            cursor.execute(sql_update_history, (user_update, job_hw_id, short_name_val))

            # Step 2: INSERT toàn bộ record trong job.eaves thành record mới (IsOldData = 0, NEWID())
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
                    IsOldData,
                    InputDataJson,
                    FloorLevel
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
                    %s
                );
            """

            for item in job.eaves:
                item_short_name = item.short_name.strip().upper()
                if item_short_name != authoritative_short_name:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Client '{item_short_name}' does not match job '{input_job_id}' "
                            f"(expected '{authoritative_short_name}')."
                        ),
                    )

                sheet_brand_val = item.sheet_brand.strip().upper()
                sheet_thickness_val = _parse_decimal(item.sheet_thickness)
                sofit_batten_val = item.sofit_batten.strip()
                sofit_bead_val = item.sofit_bead.strip()
                flr_lvl = (item.floor_level or "GF").strip()
                input_data_val = _normalize_input_data(item.input_data)
                if not all((sheet_brand_val, sofit_batten_val, sofit_bead_val)) or not sheet_thickness_val or sheet_thickness_val <= 0:
                    raise HTTPException(status_code=422, detail=f"Eaves setup for job '{input_job_id}' is incomplete or invalid.")

                cursor.execute(
                    sql_insert_new,
                    (
                        sheet_brand_val,
                        sheet_thickness_val,
                        sofit_batten_val,
                        sofit_bead_val,
                        item_short_name,
                        job_hw_id,
                        user_update,
                        json.dumps(input_data_val, separators=(",", ":")),
                        flr_lvl,
                    ),
                )

            cursor.execute("""
                SELECT COUNT(*)
                FROM [ProcurementApp].[dbo].[EavesSoffit]
                WHERE IdJob_HW = %s
                  AND UPPER(LTRIM(RTRIM(ISNULL(short_name, '')))) = %s
                  AND ISNULL(IsOldData, 0) = 0;
            """, (job_hw_id, short_name_val))
            active_count_row = cursor.fetchone()
            active_count = int(_row_value(active_count_row, "", 0) or 0)
            if active_count != len(job.eaves):
                raise HTTPException(
                    status_code=409,
                    detail=f"Expected {len(job.eaves)} current Eaves row(s) for job '{input_job_id}', found {active_count}.",
                )

            saved_summary.append({
                "id_job_hw": job_hw_id,
                "eaves_inserted": len(job.eaves)
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

    except HTTPException:
        if conn:
            try:
                conn.rollback()
            except Exception as rb_err:
                logger.error(f"Lỗi khi Rollback MSSQL: {rb_err}")
        raise
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
async def save_eaves_single(payload: dict, request: Request):
    """
    Endpoint lưu đơn lẻ (POST / PUT /api/eaves/save).
    Tự động chuyển đổi payload đơn lẻ sang quy trình Transaction & Versioning /api/eaves/save-jobs.
    """
    id_job_hw = payload.get("id_job_hw") or payload.get("hw_id") or payload.get("IdJob_HW")
    if not id_job_hw:
        raise HTTPException(status_code=400, detail="id_job_hw là bắt buộc")

    sheet_brand = payload.get("sheet_brand") or payload.get("SheetBrand") or payload.get("brand")
    sheet_thickness = payload.get("sheet_thickness") or payload.get("SheetThickness") or payload.get("thickness")
    sofit_batten = payload.get("sofit_batten") or payload.get("SofitBatten") or payload.get("batten")
    sofit_bead = payload.get("sofit_bead") or payload.get("SofitBead") or payload.get("bead")
    short_name = payload.get("short_name")
    floor_level = payload.get("floor_level") or payload.get("FloorLevel") or "GF"
    input_data = payload.get("input_data") or payload.get("InputData") or payload.get("inputs") or {}
    user_update = payload.get("user_update") or request.headers.get("x-username")

    missing = [
        name
        for name, value in (
            ("sheet_brand", sheet_brand),
            ("sheet_thickness", sheet_thickness),
            ("sofit_batten", sofit_batten),
            ("sofit_bead", sofit_bead),
            ("short_name", short_name),
            ("user_update", user_update),
        )
        if value is None or (isinstance(value, str) and not value.strip())
    ]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {', '.join(missing)}")

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
                        short_name=short_name,
                        floor_level=floor_level,
                        input_data=input_data
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
