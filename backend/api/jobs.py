"""
backend/api/jobs.py
===================
Module xử lý quản lý dự án (Jobs) của EzeFloor.
Bao gồm các chức năng: Lưu dự án, Đọc danh sách dự án của người dùng, Đọc dữ liệu chi tiết,
Khôi phục, Đổi tên, Xóa dự án, Trích xuất & thu nhỏ ảnh thu nhỏ (Thumbnail Base64) để tối ưu dung lượng DB,
Xem lịch sử chỉnh sửa chéo, và Chia sẻ dự án công khai qua Token bảo mật.
"""

from fastapi import APIRouter, HTTPException, Depends, Response, Header, Query
import secrets
import logging
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db_connection
from api.auth import validate_session
import json

logger = logging.getLogger("ezefloor.jobs")

# Khởi tạo APIRouter cho các API liên quan đến quản lý dự án
router = APIRouter()

# ── Katherine (EZE0098) standard HW contract ──
# Cairns keeps its existing separate workflow. Every other Katherine customer
# uses the common 13-step contract.
KATHERINE_STANDARD_STEPS = {
    1: "Cladding",
    2: "Eaves Soffit",
    3: "Flooring & Decking",
    4: "Frame Hardware",
    5: "Insulation",
    6: "Lockup",
    7: "Fixout",
    8: "Final Fit",
    9: "Shelving",
    10: "Timber Post",
    11: "FOW Plumbing",
    12: "Power Truss Braces",
    13: "Hardies Fire Walls",
}

KATHERINE_STEP_TO_MODULE = {
    1: "cladding",
    2: "eaves_soffit",
    3: "flooring_decking",
    4: "frame_hardware",
    5: "insulation",
    6: "lock_up",
    7: "fixout",
    8: "final_fit",
    9: "shelving",
    10: "timber_posts",
    11: "fow_plumbing",
    12: "power_truss_braces",
    13: "hardies_fire_walls",
}

# Canonical Procurement task keys.  TaskList owns which HW steps exist/are
# selected; Procurement owns the catalog/calculation contract for each step.
KATHERINE_STEP_TO_PROCUREMENT_TASK = {
    1: "cladding",
    2: "eaves-soffits",
    3: "flooring",
    4: "frame-hardware",
    5: "insulation",
    6: "lock-up",
    7: "fixout",
    8: "final-fit",
    9: "shelving",
    10: "beams-posts",
    11: "fow-plumbing",
    12: "power-truss-braces",
    13: "hardies-fire-walls",
}

TASKLIST_STEP_MODULE_IDS = KATHERINE_STEP_TO_MODULE

def _is_cairns_customer(customer: str) -> bool:
    return "CAIRNS" in str(customer or "").strip().upper()


def _load_tasklist_module_selections(hw_ids):
    """Read explicit TaskList module visibility for several HW groups.

    This helper is deliberately read-only. A group is considered configured
    only when at least one step has a non-NULL ``is_visible`` value. Older
    groups whose visibility has never been configured therefore keep the
    frontend's legacy fallback instead of being interpreted as "select none".
    """
    normalized_ids = []
    seen_ids = set()
    for value in hw_ids or []:
        key = str(value or "").strip()
        if key and key not in seen_ids:
            seen_ids.add(key)
            normalized_ids.append(key)

    if not normalized_ids:
        return {}

    from app.mssql_db import get_mssql_connection

    selections = {}
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        # Stay safely below SQL Server's 2,100 parameter limit.
        for start in range(0, len(normalized_ids), 500):
            batch = normalized_ids[start:start + 500]
            placeholders = ", ".join(["%s"] * len(batch))
            cursor.execute(
                f"""
                SELECT
                    CAST(steps.task_group_hw_id AS nvarchar(100)) AS hw_id,
                    steps.step_number,
                    steps.is_visible
                FROM [emsflow].[dbo].[task_group_hw_steps] steps WITH (NOLOCK)
                WHERE steps.task_group_hw_id IN ({placeholders})
                  AND steps.step_number BETWEEN 1 AND 13
                ORDER BY steps.task_group_hw_id, steps.step_number
                """,
                tuple(batch),
            )

            for row in cursor.fetchall():
                hw_id = str(row.get("hw_id") or "").strip()
                if not hw_id:
                    continue
                entry = selections.setdefault(hw_id, {
                    "configured": False,
                    "selected_modules": [],
                    "_step_numbers": set(),
                })
                step_number = int(row.get("step_number") or 0)
                entry["_step_numbers"].add(step_number)
                is_visible = row.get("is_visible")
                if is_visible is not None:
                    entry["configured"] = True
                if is_visible in (True, 1, "1"):
                    module_id = TASKLIST_STEP_MODULE_IDS.get(step_number)
                    if module_id and module_id not in entry["selected_modules"]:
                        entry["selected_modules"].append(module_id)
    except Exception as exc:
        # Selection sync must not make the whole job list unavailable on an
        # older TaskList schema. The frontend will use its legacy fallback.
        logger.warning("[task-selection] Không thể đọc task_group_hw_steps: %s", exc)
        return {}
    finally:
        if conn:
            conn.close()

    # Other TaskList managers use unrelated 1-3 step contracts. Only interpret
    # the standard HW contract, which contains step 12 or 13, with the mapping above.
    for entry in selections.values():
        steps_present = entry.pop("_step_numbers", set())
        if 12 not in steps_present and 13 not in steps_present:
            entry["configured"] = False
            entry["selected_modules"] = []

    return selections


def _load_tasklist_step_summaries(hw_manager_pairs):
    """Bulk-read TaskList HW step status for the job cards.

    ``task_group_hw_steps`` is the workflow source of truth.  The read is bulked
    into one query for the current EMS candidate page, so showing true task
    counts/status does not re-introduce the old N+1 loading problem.
    """
    pairs = {}
    for hw_id, manager_code in hw_manager_pairs or []:
        key = str(hw_id or "").strip()
        if key:
            pairs[key] = str(manager_code or "").strip().upper()
    if not pairs:
        return {}

    from app.mssql_db import get_mssql_connection

    rows_by_hw = {key: [] for key in pairs}
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        ids = list(pairs)
        for start in range(0, len(ids), 500):
            batch = ids[start:start + 500]
            placeholders = ", ".join(["%s"] * len(batch))
            cursor.execute(
                f"""
                SELECT
                    CAST(task_group_hw_id AS nvarchar(100)) AS hw_id,
                    step_number, manager_code, is_visible, is_done, status,
                    is_checked, checker_status
                FROM [emsflow].[dbo].[task_group_hw_steps] WITH (NOLOCK)
                WHERE task_group_hw_id IN ({placeholders})
                ORDER BY task_group_hw_id, step_number
                """,
                tuple(batch),
            )
            for row in cursor.fetchall() or []:
                hw_id = str(row.get("hw_id") or "").strip()
                if hw_id in rows_by_hw:
                    rows_by_hw[hw_id].append(row)
    except Exception as exc:
        logger.warning("[task-summary] Không thể đọc task_group_hw_steps: %s", exc)
        return {}
    finally:
        if conn:
            conn.close()

    result = {}
    for hw_id, raw_rows in rows_by_hw.items():
        manager = pairs.get(hw_id, "")
        manager_rows = [
            r for r in raw_rows
            if str(r.get("manager_code") or "").strip().upper() == manager
        ] if manager else []
        scoped_rows = manager_rows or raw_rows

        # One logical task per step number.  Legacy rows can contain another
        # manager partition; prefer the current AssignJob manager when present.
        by_step = {}
        for row in scoped_rows:
            try:
                step_no = int(row.get("step_number") or 0)
            except Exception:
                step_no = 0
            if step_no > 0 and step_no not in by_step:
                by_step[step_no] = row

        ordered = [by_step[n] for n in sorted(by_step)]
        configured = any(r.get("is_visible") is not None for r in ordered)
        selected = [r for r in ordered if r.get("is_visible") in (True, 1, "1")] if configured else ordered

        task_routes = []
        done_count = 0
        checker_done_count = 0
        for row in selected:
            step_no = int(row.get("step_number") or 0)
            estimator_done = bool(row.get("is_done")) or str(row.get("status") or "").lower() == "done"
            checker_done = bool(row.get("is_checked")) or str(row.get("checker_status") or "").lower() == "done"
            if estimator_done:
                done_count += 1
            if checker_done:
                checker_done_count += 1
            task_routes.append({
                "step_number": step_no,
                "task_name": KATHERINE_STANDARD_STEPS.get(step_no),
                "module_id": KATHERINE_STEP_TO_MODULE.get(step_no),
                "task_key": KATHERINE_STEP_TO_PROCUREMENT_TASK.get(step_no),
                "status": str(row.get("status") or "pending"),
                "is_done": estimator_done,
                "checker_done": checker_done,
            })

        modules = [r["module_id"] for r in task_routes if r.get("module_id")]
        total = len(selected)
        result[hw_id] = {
            "configured": configured,
            "task_count": total,
            "task_done_count": done_count,
            "task_pending_count": max(0, total - done_count),
            "task_checker_done_count": checker_done_count,
            "task_routes": task_routes,
            "selected_modules": modules,
            "all_selected_tasks_done": bool(total and done_count == total),
        }
    return result

# ── Pydantic Schemas (Mô hình dữ liệu đầu vào và đầu ra) ──

class JobCreate(BaseModel):
    """Mô hình dữ liệu gửi lên khi tạo mới hoặc cập nhật một dự án."""
    username: str
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    data: str  # Chuỗi JSON chứa toàn bộ trạng thái vẽ (phòng, tường, cửa, tỷ lệ vẽ)


class JobResponse(BaseModel):
    """Mô hình phản hồi thông tin tóm tắt dự án của một người dùng cụ thể."""
    id: int
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    created_at: str
    thumbnail: Optional[str] = None
    is_trained: Optional[int] = 0
    is_corrected: Optional[int] = 0
    share_token: Optional[str] = None


class JobAllResponse(BaseModel):
    """Mô hình phản hồi thông tin tóm tắt dự án dành cho màn hình giám sát toàn hệ thống (Admin)."""
    id: int
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    created_at: str
    username: str
    thumbnail: Optional[str] = None
    is_trained: Optional[int] = 0
    is_corrected: Optional[int] = 0
    share_token: Optional[str] = None


# ── Helper Functions (Hàm bổ trợ xử lý ảnh và trích xuất dữ liệu) ──

def resize_image(b64_str: str, size=(200, 200)) -> str:
    """
    Thu nhỏ kích thước hình ảnh dưới dạng chuỗi Base64.
    Mục đích: Chuyển đổi bản vẽ dung lượng lớn thành ảnh thumbnail siêu nhẹ để lưu vào database
    mà không làm nghẽn hiệu năng truy vấn DB. Sử dụng nén JPEG chất lượng 70%.
    """
    if not b64_str or "," not in b64_str:
        return b64_str
    
    try:
        import base64
        import io
        from PIL import Image
        
        # Tách phần header định dạng dữ liệu ra khỏi chuỗi Base64 mã hóa
        header, encoded = b64_str.split(",", 1)
        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))
        
        # Thực hiện thu nhỏ ảnh giữ nguyên tỷ lệ khung hình (Aspect Ratio) sử dụng thuật toán nén LANCZOS chất lượng cao
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=70)  # Nén định dạng JPEG chất lượng 70 để đạt dung lượng tối ưu
        new_encoded = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{new_encoded}"
    except Exception as e:
        print(f"Lỗi khi nén ảnh thumbnail: {e}")
        return b64_str


def _extract_thumbnail(data_str: str) -> Optional[str]:
    """
    Trích xuất ảnh nền từ trang đầu tiên (Page 0) của dự án để tạo ảnh thumbnail.
    """
    try:
        job_data = json.loads(data_str)
        pages = job_data.get("pages", [])
        if pages and len(pages) > 0:
            raw_img = pages[0].get("image")
            if raw_img:
                return resize_image(raw_img)
    except Exception:
        pass
    return None


# ── API Endpoints (Các định tuyến giao tiếp dự án) ──

@router.post("/jobs")
def create_job(job: JobCreate, username: str = Depends(validate_session)):
    """
    Lưu dự án vẽ sàn (Tạo mới hoặc Cập nhật ghi đè bản cũ).
    - Hỗ trợ đổi chủ sở hữu dự án (Ownership) nếu một người dùng khác lưu đè lên tên dự án cũ.
    - Lưu vết lịch sử chỉnh sửa chéo vào bảng `job_history`.
    - Trích xuất tự động và nén ảnh đại diện (Thumbnail) để tối ưu lưu trữ.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Chuẩn hóa tên dự án (bỏ khoảng trắng thừa ở hai đầu)
        job.project_name = job.project_name.strip()

        # Tìm ID của người dùng thực hiện yêu cầu dựa trên username đã được xác thực
        cursor.execute("SELECT id FROM users WHERE username = ?", (job.username,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin người dùng trong hệ thống.")
        
        user_id = user_row["id"]
        
        # Tự động trích xuất và nén hình ảnh trang đầu làm thumbnail
        thumbnail = _extract_thumbnail(job.data)
        
        # Kiểm tra xem tên dự án đã tồn tại hay chưa (không phân biệt hoa thường)
        cursor.execute(
            "SELECT id, user_id FROM jobs WHERE LOWER(project_name) = LOWER(?)", 
            (job.project_name,)
        )
        existing_job = cursor.fetchone()
        
        if existing_job:
            old_user_id = existing_job["user_id"]
            
            # Ghi nhận lịch sử bàn giao/ghi đè nếu người lưu hiện tại khác với người tạo ban đầu
            if old_user_id != user_id:
                cursor.execute(
                    "INSERT INTO job_history (job_id, project_name, old_user_id, new_user_id) VALUES (?, ?, ?, ?)",
                    (existing_job["id"], job.project_name, old_user_id, user_id)
                )

            # Thực hiện cập nhật ghi đè nội dung bản vẽ, tổng diện tích, thumbnail và chuyển quyền sở hữu
            cursor.execute(
                """UPDATE jobs SET user_id = ?, project_name = ?, room_count = ?, 
                   total_area = ?, data = ?, thumbnail = ?, is_corrected = 1, 
                   created_at = CURRENT_TIMESTAMP 
                   WHERE id = ?""",
                (user_id, job.project_name, job.room_count, job.total_area, job.data, thumbnail, existing_job["id"])
            )
            conn.commit()
            
            try:
                from services.search.vector_search_engine import clear_project_index_cache
                clear_project_index_cache(existing_job["id"])
            except Exception:
                pass
                
            return {"status": "updated", "job_id": existing_job["id"]}
        else:
            # Tạo mới hoàn toàn một bản vẽ dự án
            cursor.execute(
                "INSERT INTO jobs (user_id, project_name, room_count, total_area, data, thumbnail) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, job.project_name, job.room_count, job.total_area, job.data, thumbnail)
            )
            conn.commit()
            return {"status": "success", "job_id": cursor.lastrowid}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/count")
def get_jobs_count(username: Optional[str] = None):
    """
    Lấy số lượng tổng số dự án đã lưu trong hệ thống.
    - Nếu cung cấp `username`: Đếm số lượng dự án thuộc sở hữu của người dùng đó.
    - Nếu không: Trả về số lượng toàn bộ dự án trên hệ thống.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            if username and username.strip() not in ("undefined", "null", "None", ""):
                cursor.execute(
                    "SELECT COUNT(*) as total FROM jobs j JOIN users u ON j.user_id = u.id WHERE u.username = ?", 
                    (username.strip(),)
                )
            else:
                cursor.execute("SELECT COUNT(*) as total FROM jobs")
                
            row = cursor.fetchone()
            count = int(row["total"]) if row and row["total"] is not None else 0
            return {"count": count}
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Lỗi khi đếm số dự án (trả về 0 mặc định): {e}")
        return {"count": 0}


@router.get("/jobs/history")
def get_job_history():
    """
    Lấy lịch sử hoạt động ghi đè hoặc chỉnh sửa dự án chéo giữa các người dùng.
    Hỗ trợ Admin kiểm soát vết truy cập và bàn giao công việc bản vẽ. Giới hạn trả về tối đa 100 dòng mới nhất.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT h.project_name, u_old.username as old_user, u_new.username as new_user, h.changed_at
            FROM job_history h
            LEFT JOIN users u_old ON h.old_user_id = u_old.id
            JOIN users u_new ON h.new_user_id = u_new.id
            ORDER BY h.changed_at DESC
            LIMIT 100
        """)
        rows = cursor.fetchall()
        return [{"project_name": r["project_name"], "old_user": r["old_user"], "new_user": r["new_user"], "changed_at": str(r["changed_at"])} for r in rows]
    except Exception as e:
        logger.error(f"Lỗi khi đọc lịch sử bản vẽ: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
# EMS JOBS / TASK HW PANEL (DIRECT EMS READ)
# ══════════════════════════════════════════════════════

@router.get("/jobs/tasklist-jobs")
async def get_tasklist_jobs(
    ma_nv: Optional[str] = Query(None, description="Lọc theo mã nhân viên e.g. EZE0098"),
    search: Optional[str] = Query(None, description="Tìm kiếm mã Job, Client, Builder, Address"),
    limit: int = Query(500, ge=1, le=500, description="Số lượng job tối đa"),
    force_refresh: bool = Query(False, description="Giữ tương thích UI; dữ liệu luôn đọc trực tiếp từ EMS")
):
    """Fast EMS job list for the Task HW panel.

    Keep the same source as ProcurementApp (ListJobs/ListClient), but only load a
    bounded page first.  Expensive Task HW enrichment is then performed for that
    small candidate set instead of against tens of thousands of EMS rows.
    """
    from app.mssql_db import get_mssql_connection

    # ProcurementApp intentionally keeps job-list requests bounded (<= 500).
    # EzeFloor used to request 20,000 rows and then enrich every row, which made
    # this panel much slower despite displaying only a few dozen cards.
    limit_val = max(1, min(int(limit or 500), 500))
    clean_manv = ma_nv.strip() if isinstance(ma_nv, str) and ma_nv.strip() else None
    clean_search = search.strip() if isinstance(search, str) and search.strip() else None

    from app.customer_modules.registry import CUSTOMER_TASKS

    procurement_client_short_names = tuple(CUSTOMER_TASKS.keys())
    procurement_client_full_names = ("Cairns Hardware Whole Of House",)

    short_name_placeholders = ", ".join(["%s"] * len(procurement_client_short_names))
    full_name_placeholders = ", ".join(["%s"] * len(procurement_client_full_names))

    candidate_where = [
        "ISNULL(lj.IsDelete, 0) = 0",
        f"(lc.ShortName IN ({short_name_placeholders}) OR lj.Client IN ({full_name_placeholders}))",
        "(lc.IsDelete = 0 OR lc.IsDelete IS NULL OR lc.ClientName IS NULL)",
    ]
    params = list(procurement_client_short_names) + list(procurement_client_full_names)

    # Match Procurement's server-side job search.  Search stays global even
    # though the normal list is capped to 500 recent jobs.
    if clean_search:
        candidate_where.append("""(
            lj.JobNumber LIKE %s
            OR lj.ClientJobNumber LIKE %s
            OR lj.Builder LIKE %s
            OR lj.Address LIKE %s
            OR lj.Client LIKE %s
            OR lc.ShortName LIKE %s
        )""")
        pattern = f"%{clean_search}%"
        params.extend([pattern] * 6)

    staff_where = ""
    if clean_manv:
        staff_where = "WHERE UPPER(LTRIM(RTRIM(COALESCE(aj.MaNV, '')))) = UPPER(%s)"
        params.append(clean_manv)

    # IMPORTANT: TOP is applied to ListJobs *before* OUTER APPLY task_group_hw.
    # The old query applied Task HW lookup while scanning up to 20k EMS jobs.
    sql = f"""
        WITH candidate_jobs AS (
            SELECT TOP {limit_val}
                lj.IDJob,
                lj.JobNumber,
                lj.ClientJobNumber,
                lj.Client,
                lj.Builder,
                lj.Address,
                lj.Suburb,
                lj.TrangThai,
                lj.NgayCapNhat,
                COALESCE(NULLIF(lc.ShortName, ''), lj.Client) AS resolved_client,
                COALESCE(lc.ClientName, lj.Client) AS resolved_client_name
            FROM [Ezequotepersonalmanagement].[dbo].[ListJobs] AS lj WITH (NOLOCK)
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] AS lc WITH (NOLOCK)
                ON lc.ClientName = lj.Client
                AND ISNULL(lc.IsDelete, 0) = 0
            WHERE {' AND '.join(candidate_where)}
            ORDER BY lj.NgayCapNhat DESC, lj.JobNumber DESC
        )
        SELECT
            CAST(lj.IDJob AS NVARCHAR(100)) AS id_job_ems,
            tghw.hw_id,
            tghw.id_assign_ems,
            tghw.created_at,
            tghw.progress,
            tghw.is_done,
            lj.JobNumber AS job_number,
            lj.resolved_client AS client,
            lj.resolved_client_name AS client_name,
            lj.ClientJobNumber AS customer_reference_number,
            lj.Builder AS builder,
            lj.Address AS address,
            lj.Suburb AS suburb,
            lj.TrangThai AS status,
            lj.NgayCapNhat AS updated_at,
            aj.MaNV AS ma_nv,
            aj.TrangThaiCongViec AS assign_status,
            ISNULL(aj.IsComp, 0) AS assign_is_comp
        FROM candidate_jobs AS lj
        OUTER APPLY (
            SELECT TOP 1
                t.id AS hw_id,
                t.id_assign_ems,
                t.created_at,
                t.progress,
                t.is_done
            FROM [emsflow].[dbo].[task_group_hw] AS t WITH (NOLOCK)
            WHERE t.id_job_ems = lj.IDJob
              AND ISNULL(t.is_delete, 0) = 0
            ORDER BY t.created_at DESC
        ) AS tghw
        LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] AS aj WITH (NOLOCK)
            ON aj.ID = tghw.id_assign_ems
            AND ISNULL(aj.IsDelete, 0) = 0
        {staff_where}
        ORDER BY lj.NgayCapNhat DESC, lj.JobNumber DESC
    """

    mconn = None
    try:
        mconn = get_mssql_connection()
        mcursor = mconn.cursor(as_dict=True)
        if params:
            mcursor.execute(sql, tuple(params))
        else:
            mcursor.execute(sql)
        ems_rows = mcursor.fetchall() or []
    except Exception as exc:
        logger.exception("[ems-jobs] Không thể đọc ListJobs trực tiếp từ EMS")
        raise HTTPException(status_code=502, detail=f"Không thể đọc danh sách EMS jobs: {exc}")
    finally:
        if mconn is not None:
            try:
                mconn.close()
            except Exception:
                pass

    # Only compare local drawings for the EMS jobs actually returned.  The old
    # code scanned the entire local jobs table on every Task HW refresh/search.
    local_by_project = {}
    local_conn = None
    try:
        job_numbers = sorted({
            str(row.get("job_number") or "").strip().lower()
            for row in ems_rows
            if str(row.get("job_number") or "").strip()
        })
        if job_numbers:
            local_conn = get_db_connection()
            local_cursor = local_conn.cursor()
            placeholders = ", ".join(["?"] * len(job_numbers))
            local_cursor.execute(
                f"""
                SELECT id, project_name, room_count, total_area
                FROM jobs
                WHERE LOWER(TRIM(project_name)) IN ({placeholders})
                """,
                tuple(job_numbers),
            )
            for row in local_cursor.fetchall() or []:
                item = dict(row) if isinstance(row, dict) or hasattr(row, "keys") else {
                    "id": row[0], "project_name": row[1], "room_count": row[2], "total_area": row[3]
                }
                key = str(item.get("project_name") or "").strip().lower()
                if key:
                    local_by_project[key] = item
    except Exception as exc:
        logger.warning(f"[ems-jobs] Không thể đối chiếu local jobs (non-fatal): {exc}")
    finally:
        if local_conn is not None:
            try:
                local_conn.close()
            except Exception:
                pass

    # TaskList is the source of truth for task selection/count/status.
    # One bulk read keeps the panel fast while exposing the same selected steps
    # that the TaskList HW workflow actually uses.
    step_summaries = _load_tasklist_step_summaries([
        (row.get("hw_id"), row.get("ma_nv"))
        for row in ems_rows
        if row.get("hw_id") is not None
    ])

    results = []
    for row in ems_rows:
        job_number = str(row.get("job_number") or "").strip()
        local_job = local_by_project.get(job_number.lower()) if job_number else None
        has_local = bool(local_job and local_job.get("id") is not None)
        results.append({
            "id": str(row.get("id_job_ems") or ""),
            "hw_id": str(row.get("hw_id")) if row.get("hw_id") is not None else None,
            "id_job_ems": str(row.get("id_job_ems") or ""),
            "id_assign_ems": str(row.get("id_assign_ems")) if row.get("id_assign_ems") is not None else None,
            "created_at": str(row.get("created_at") or row.get("updated_at") or ""),
            "updated_at": str(row.get("updated_at") or ""),
            "progress": float(row.get("progress") or 0),
            "is_done": bool(row.get("is_done")),
            "job_number": job_number,
            "customer_reference_number": row.get("customer_reference_number"),
            "client": row.get("client"),
            "client_name": row.get("client_name"),
            "builder": row.get("builder"),
            "address": row.get("address"),
            "suburb": row.get("suburb"),
            "status": row.get("status"),
            "ma_nv": row.get("ma_nv"),
            "assign_status": row.get("assign_status"),
            "assign_is_comp": bool(row.get("assign_is_comp")),
            "has_local_job": has_local,
            "local_job": {
                "id": local_job.get("id"),
                "project_name": local_job.get("project_name") or job_number,
                "room_count": local_job.get("room_count"),
                "total_area": local_job.get("total_area"),
            } if has_local else None,
            # Lightweight TaskList workflow summary, bulk-loaded above.
            # Procurement routing is carried as canonical task_key metadata; no
            # Procurement product catalog is loaded until the user opens a task.
            "task_modules_configured": bool(step_summaries.get(str(row.get("hw_id") or ""), {}).get("configured")),
            "selected_modules": step_summaries.get(str(row.get("hw_id") or ""), {}).get("selected_modules"),
            "task_modules": step_summaries.get(str(row.get("hw_id") or ""), {}).get("selected_modules"),
            "selected_task_count": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_count"),
            "task_count": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_count"),
            "task_done_count": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_done_count"),
            "task_pending_count": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_pending_count"),
            "task_checker_done_count": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_checker_done_count"),
            "task_routes": step_summaries.get(str(row.get("hw_id") or ""), {}).get("task_routes") or [],
            "workflow_done": bool(row.get("assign_is_comp")) or bool(row.get("is_done")),
        })

    return {
        "status": "success",
        "total": len(results),
        "completed_count": sum(1 for item in results if item["workflow_done"]),
        "data": results,
        "source": "ems_listjobs_direct_fast",
    }


@router.get("/task-steps")
@router.get("/jobs/task-steps")
@router.get("/api/jobs/task-steps")
def get_task_steps(hw_id: Optional[str] = Query(None), job_number: Optional[str] = Query(None)):
    """
    Trả về danh sách các bước (steps) được cấu hình từ TaskList API:
    Nếu job có cấu hình các step cụ thể, chỉ trả về đúng các step đó.
    Nếu không có cấu hình cụ thể, trả về danh sách standard steps.
    """
    all_steps = [
        {"step_number": 4, "id": "frame_hardware", "task_key": "frame-hardware", "label": "Frame", "name": "Frame Hardware"},
        {"step_number": 3, "id": "flooring_decking", "task_key": "flooring", "label": "Floor", "name": "Flooring & Decking"},
        {"step_number": 5, "id": "insulation", "task_key": "insulation", "label": "Insu", "name": "Insulation"},
        {"step_number": 2, "id": "eaves_soffit", "task_key": "eaves-soffits", "label": "Eaves", "name": "Eaves Soffit"},
        {"step_number": 1, "id": "cladding", "task_key": "cladding", "label": "Cladding", "name": "Cladding"},
        {"step_number": 6, "id": "lock_up", "task_key": "lock-up", "label": "Lockup", "name": "Lockup"},
        {"step_number": 9, "id": "shelving", "task_key": "shelving", "label": "Shelving", "name": "Shelving"},
        {"step_number": 10, "id": "timber_posts", "task_key": "beams-posts", "label": "Beams", "name": "Beams & Posts"},
        {"step_number": 12, "id": "power_truss_braces", "task_key": "power-truss-braces", "label": "Truss", "name": "Power Truss Braces"},
        {"step_number": 11, "id": "fow_plumbing", "task_key": "fow-plumbing", "label": "Plumbing", "name": "FOW Plumbing"},
        {"step_number": 7, "id": "fixout", "task_key": "fixout", "label": "Fixout", "name": "Fixout"},
        {"step_number": 8, "id": "final_fit", "task_key": "final-fit", "label": "Final", "name": "Final Fit"},
        {"step_number": 13, "id": "hardies_fire_walls", "task_key": "hardies-fire-walls", "label": "Fire Wall", "name": "Hardies Fire Walls"},
    ]

    target_hw_id = str(hw_id).strip() if hw_id else None

    # Nếu chưa có hw_id nhưng có job_number, tra cứu hw_id từ task_group_hw_cache
    if not target_hw_id and job_number:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT hw_id FROM task_group_hw_cache WHERE LOWER(TRIM(job_number)) = LOWER(TRIM(?)) LIMIT 1",
                (str(job_number).strip(),)
            )
            row = cursor.fetchone()
            if row:
                target_hw_id = str(row["hw_id"] if isinstance(row, dict) else row[0]).strip()
            conn.close()
        except Exception as e:
            logger.warning("[get_task_steps] Tra cứu hw_id theo job_number thất bại: %s", e)

    selected_steps = all_steps
    if target_hw_id:
        try:
            selections = _load_tasklist_module_selections([target_hw_id])
            group_sel = selections.get(target_hw_id)
            if group_sel and group_sel.get("configured") and group_sel.get("selected_modules"):
                enabled_mods = set(group_sel.get("selected_modules"))
                filtered = [s for s in all_steps if s["id"] in enabled_mods]
                if filtered:
                    selected_steps = filtered
        except Exception as e:
            logger.warning("[get_task_steps] Lỗi khi đọc module selections cho hw_id %s: %s", target_hw_id, e)

    return {
        "status": "success",
        "total": len(selected_steps),
        "steps": selected_steps
    }


@router.get("/jobs/progress-report")
@router.get("/api/jobs/progress-report")
def get_jobs_progress_report(
    start_date: Optional[str] = Query(None, description="Từ ngày YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Đến ngày YYYY-MM-DD"),
    username: Optional[str] = Query(None, description="Lọc theo nhân viên/User"),
    search: Optional[str] = Query(None, description="Tìm tên job / project name"),
    status: Optional[str] = Query(None, description="all | completed | pending"),
    limit: int = Query(2000, ge=1, le=10000),
    offset: int = Query(0, ge=0)
):
    """
    Báo cáo tiến độ công việc tổng hợp (Job Progress & Productivity Report).
    Bao gồm toàn bộ Task nhóm HW và các Job vẽ trên hệ thống EzeFloor.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        from app.database import DB_TYPE
        
        where_clauses = []
        params = []
        
        if username and username.strip() and username.strip() != "all":
            u_clean = username.strip()
            where_clauses.append("(LOWER(TRIM(t.username)) = LOWER(?) OR LOWER(TRIM(t.staff_code)) = LOWER(?))")
            params.extend([u_clean, u_clean])
            
        if search and search.strip():
            sp = f"%{search.strip()}%"
            where_clauses.append("(t.project_name LIKE ? OR t.username LIKE ? OR t.staff_code LIKE ? OR t.client LIKE ? OR t.builder LIKE ?)")
            params.extend([sp, sp, sp, sp, sp])
            
        if start_date and start_date.strip():
            where_clauses.append("t.created_at >= ?")
            params.append(f"{start_date.strip()} 00:00:00")
            
        if end_date and end_date.strip():
            where_clauses.append("t.created_at <= ?")
            params.append(f"{end_date.strip()} 23:59:59")
            
        if status == "completed":
            where_clauses.append("t.is_completed = 1")
        elif status == "pending":
            where_clauses.append("t.is_completed = 0")
            
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        base_union_sql = """
            SELECT 
                t.hw_id,
                t.id_job_ems,
                t.id_assign_ems,
                j.project_name,
                t.client,
                t.builder,
                COALESCE(t.ma_nv, u.username, 'Admin') AS staff_code,
                COALESCE(u.username, t.ma_nv, 'Admin') AS username,
                u.email,
                COALESCE(j.room_count, 0) AS room_count,
                COALESCE(j.total_area, 0.0) AS total_area,
                j.created_at,
                j.id AS local_job_id,
                COALESCE(j.is_trained, 0) AS is_trained,
                j.thumbnail,
                CASE WHEN j.is_trained = 1 OR t.is_done = 1 OR t.progress >= 100 THEN 1 ELSE 0 END AS is_completed,
                CASE WHEN j.is_trained = 1 OR t.is_done = 1 OR t.progress >= 100 THEN 100.0 ELSE COALESCE(t.progress, 100.0) END AS progress
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            LEFT JOIN task_group_hw_cache t ON LOWER(TRIM(t.job_number)) = LOWER(TRIM(j.project_name))
        """
        
        sql = f"""
            SELECT * FROM (
                {base_union_sql}
            ) t
            {where_sql}
            ORDER BY t.created_at DESC
            LIMIT {limit} OFFSET {offset}
        """
        
        if DB_TYPE == "mysql":
            sql = sql.replace("?", "%s")
            
        cursor.execute(sql, tuple(params) if params else None)
        rows = cursor.fetchall()
        
        items = []
        total_area_sum = 0.0
        total_rooms_sum = 0
        completed_count = 0
        
        for r in rows:
            d = dict(r)
            is_comp = bool(d.get("is_completed") == 1)
            if is_comp:
                completed_count += 1
                
            total_area_sum += float(d.get("total_area") or 0)
            total_rooms_sum += int(d.get("room_count") or 0)
            
            created_str = str(d.get("created_at") or "")
            completed_str = created_str if is_comp else None
            
            items.append({
                "id": d.get("local_job_id") or d.get("id_assign_ems") or d.get("hw_id"),
                "local_job_id": d.get("local_job_id"),
                "hw_id": d.get("hw_id"),
                "id_job_ems": d.get("id_job_ems"),
                "id_assign_ems": d.get("id_assign_ems"),
                "project_name": d.get("project_name"),
                "staff_code": d.get("staff_code"),
                "username": d.get("username") or d.get("staff_code") or "Unknown",
                "email": d.get("email"),
                "client": d.get("client"),
                "builder": d.get("builder"),
                "created_at": created_str,
                "completed_at": completed_str,
                "is_completed": is_comp,
                "progress": float(d.get("progress") or 0),
                "room_count": int(d.get("room_count") or 0),
                "total_area": float(d.get("total_area") or 0),
                "is_trained": int(d.get("is_trained") or 0),
                "thumbnail": d.get("thumbnail")
            })
            
        return {
            "status": "success",
            "total_jobs": len(items),
            "completed_jobs": completed_count,
            "pending_jobs": len(items) - completed_count,
            "total_area": round(total_area_sum, 2),
            "total_rooms": total_rooms_sum,
            "items": items
        }
    except Exception as e:
        logger.error(f"[get_jobs_progress_report] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/{username}", response_model=List[JobResponse])
def get_user_jobs(username: str, limit: int = 20, offset: int = 0, current_user: str = Depends(validate_session)):
    """
    Lấy danh sách các dự án thuộc quyền sở hữu của một người dùng cụ thể.
    - Hỗ trợ phân trang bằng `limit` và `offset`.
    - Yêu cầu xác thực phiên đăng nhập hợp lệ.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT j.id, j.project_name, j.room_count, j.total_area, j.created_at, j.thumbnail, j.is_trained, j.is_corrected, j.share_token
            FROM jobs j
            JOIN users u ON j.user_id = u.id
            WHERE u.username = ?
            ORDER BY j.created_at DESC
            LIMIT ? OFFSET ?
        """, (username, limit, offset))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/all-jobs", response_model=List[JobAllResponse])
def get_all_jobs(limit: int = 50, offset: int = 0):
    """
    Lấy danh sách toàn bộ các dự án của mọi người dùng trong hệ thống (dành cho Admin quản trị).
    - Hỗ trợ phân trang và sắp xếp theo mốc thời gian tạo giảm dần (mới nhất hiển thị đầu tiên).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(jobs)")
        cols = {row[1] for row in cursor.fetchall()}
        
        select_cols = ["j.id", "j.project_name", "j.room_count", "j.total_area", "j.created_at", "u.username", "j.thumbnail"]
        select_cols.append("j.is_trained" if "is_trained" in cols else "0 AS is_trained")
        select_cols.append("j.is_corrected" if "is_corrected" in cols else "0 AS is_corrected")
        select_cols.append("j.share_token" if "share_token" in cols else "NULL AS share_token")
        
        sql = f"""
            SELECT {', '.join(select_cols)}
            FROM jobs j
            JOIN users u ON j.user_id = u.id
            ORDER BY j.created_at DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(sql, (limit, offset))
        rows = cursor.fetchall()
        
        result = []
        for r in rows:
            d = dict(r)
            if d.get("is_trained") is None: d["is_trained"] = 0
            if d.get("is_corrected") is None: d["is_corrected"] = 0
            result.append(d)
        return result
    except Exception as e:
        logger.error(f"[get_all_jobs] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/data/{job_id}")
def get_job_data(job_id: int, username: str = Depends(validate_session)):
    """
    Lấy chi tiết chuỗi dữ liệu trạng thái bản vẽ của một dự án thông qua ID.
    - Yêu cầu xác thực phiên đăng nhập hợp lệ.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT data FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án được yêu cầu.")
        return {"status": "success", "data": row["data"]}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/find")
@router.get("/api/jobs/find")
def find_job(query: str):
    """
    Tìm kiếm và nạp dữ liệu dự án theo:
    - ID số nguyên (ví dụ: 123)
    - Hoặc Tên dự án / Mã Job Number (ví dụ: 'JOB-2024-001', 'P-101', ...)
    """
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    
    clean_query = query.strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        row = None
        # 1. Thử tìm theo ID số nguyên
        if clean_query.isdigit():
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE id = ?",
                (int(clean_query),)
            )
            row = cursor.fetchone()

        # 2. Nếu không thấy, tìm chính xác theo project_name (không phân biệt hoa thường)
        if not row:
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE LOWER(project_name) = LOWER(?) ORDER BY created_at DESC LIMIT 1",
                (clean_query,)
            )
            row = cursor.fetchone()

        # 3. Nếu vẫn không thấy, thử tìm LIKE '%query%'
        if not row:
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE LOWER(project_name) LIKE LOWER(?) ORDER BY created_at DESC LIMIT 1",
                (f"%{clean_query}%",)
            )
            row = cursor.fetchone()

        if row:
            row_dict = dict(row)
            return {
                "status": "success",
                "found": True,
                "job_id": row_dict["id"],
                "project_name": row_dict["project_name"],
                "room_count": row_dict.get("room_count", 0),
                "total_area": row_dict.get("total_area", 0.0),
                "data": row_dict["data"]
            }
        else:
            return {
                "status": "success",
                "found": False,
                "job_id": None,
                "project_name": clean_query,
                "data": None
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class RenameJobRequest(BaseModel):
    """Mô hình dữ liệu để đổi tên dự án."""
    new_name: str


@router.put("/jobs/{job_id}/rename")
def rename_job(job_id: int, req: RenameJobRequest):
    """
    Đổi tên một dự án bản vẽ dựa vào ID.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE jobs SET project_name = ? WHERE id = ?", (req.new_name, job_id))
        conn.commit()
        return {"status": "success", "message": "Đã đổi tên dự án thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int):
    """
    Xóa bỏ hoàn toàn một dự án khỏi hệ thống.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
        
        try:
            from services.search.vector_search_engine import clear_project_index_cache
            clear_project_index_cache(job_id)
        except Exception:
            pass
            
        return {"status": "success", "message": "Xóa dự án thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class MarkTrainedRequest(BaseModel):
    """Mô hình dữ liệu đánh dấu dự án đã được huấn luyện AI."""
    project_name: str
    username: str


@router.post("/jobs/mark-trained")
def mark_job_trained(req: MarkTrainedRequest, username: str = Depends(validate_session)):
    """
    Đánh dấu dự án đã được sử dụng dữ liệu để huấn luyện lại các mô hình AI YOLO/OCR.
    Điều này giúp theo dõi vòng đời dữ liệu phản hồi từ thực tế của người dùng.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Lấy user_id dựa trên username gửi lên
        cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng trong hệ thống.")
        
        user_id = user_row["id"]
        
        # Cập nhật trường dữ liệu is_trained = 1
        cursor.execute("""
            UPDATE jobs SET is_trained = 1 
            WHERE project_name = ? AND user_id = ?
        """, (req.project_name, user_id))
        conn.commit()
        return {"status": "success", "message": "Đã cập nhật trạng thái huấn luyện thành công."}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/jobs/{job_id}/share")
def toggle_share(job_id: int, active: bool, username: str = Depends(validate_session)):
    """
    Bật hoặc tắt tính năng chia sẻ dự án công khai cho người ngoài hệ thống xem.
    - Nếu bật (`active = True`): Tạo ra một Token bảo mật duy nhất ngẫu nhiên.
    - Nếu tắt (`active = False`): Xóa Token chia sẻ (khiến đường dẫn cũ bị vô hiệu hóa tức thì).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        token = secrets.token_urlsafe(16) if active else None
        cursor.execute("UPDATE jobs SET share_token = ? WHERE id = ?", (token, job_id))
        conn.commit()
        return {"status": "success", "share_token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/share/{token}")
def get_shared_job(token: str):
    """
    Xem bản vẽ dự án công khai không cần đăng nhập thông qua Token bảo mật.
    Mục đích: Cho phép người dùng gửi bản vẽ dự án trực tiếp cho khách hàng xem qua một đường dẫn độc nhất.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT project_name, data, room_count, total_area FROM jobs WHERE share_token = ?", 
            (token,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=404, 
                detail="Liên kết chia sẻ dự án không tồn tại hoặc đã hết hiệu lực."
            )
        return {
            "status": "success", 
            "project_name": row["project_name"], 
            "data": row["data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
# LOOKUP JOB BY EMS ID (SSO deep-link từ TaskList Web3)
# ══════════════════════════════════════════════════════

@router.get("/jobs/open-by-ems/{ems_id}")
async def get_job_by_ems_id(ems_id: str):
    """
    Tra cứu thông tin HW Job từ MSSQL theo id_job_ems (UUID từ TaskList).
    Sử dụng khi người dùng SSO từ TaskList Web3 với tham số ?job=<ems_uuid>.
    Trả về thông tin task_group_hw + job_number từ ListJobs.
    """
    from app.mssql_db import get_mssql_connection

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT TOP 1
                tghw.hw_id,
                CAST(lj.IDJob AS NVARCHAR(100)) AS id_job_ems,
                tghw.id_assign_ems,
                lj.JobNumber AS job_number,
                lj.Client AS client,
                UPPER(LTRIM(RTRIM(COALESCE(NULLIF(lc.ShortName, ''), lj.Client)))) AS customer_short_name,
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [Ezequotepersonalmanagement].[dbo].[ListJobs] AS lj WITH (NOLOCK)
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] AS lc WITH (NOLOCK)
                ON lc.ClientName = lj.Client
                AND ISNULL(lc.IsDelete, 0) = 0
            OUTER APPLY (
                SELECT TOP 1
                    t.id AS hw_id,
                    t.id_assign_ems,
                    t.created_at
                FROM [emsflow].[dbo].[task_group_hw] AS t WITH (NOLOCK)
                WHERE t.id_job_ems = lj.IDJob
                  AND ISNULL(t.is_delete, 0) = 0
                ORDER BY t.created_at DESC
            ) AS tghw
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] AS aj WITH (NOLOCK)
                ON aj.ID = tghw.id_assign_ems
                AND ISNULL(aj.IsDelete, 0) = 0
            WHERE ISNULL(lj.IsDelete, 0) = 0
              AND (
                CAST(lj.IDJob AS NVARCHAR(100)) = %s
                OR CAST(tghw.hw_id AS NVARCHAR(100)) = %s
              )
            ORDER BY tghw.created_at DESC
        """

        cursor.execute(sql, (ems_id, ems_id))
        row = cursor.fetchone()

        if not row:
            logger.warning(f"[open-by-ems] Không tìm thấy HW Job với id_job_ems/id={ems_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy Job EMS với ID: {ems_id}"
            )

        # Serialize kết quả
        result = {}
        for key, val in row.items():
            if val is None:
                result[key] = None
            elif isinstance(val, (int, float, str, bool)):
                result[key] = val
            else:
                result[key] = str(val)

        logger.info(f"[open-by-ems] Tìm thấy HW Job: hw_id={result.get('hw_id')}, job_number={result.get('job_number')}")

        # TaskList is authoritative for Katherine non-Cairns task visibility.
        manager_code = str(result.get("ma_nv") or "").strip().upper()
        customer = result.get("customer_short_name") or result.get("client") or ""
        result["manager_code"] = manager_code
        result["customer"] = customer

        # Return exact TaskList step status + canonical Procurement task route for
        # the clicked job. This single read is authoritative for both module
        # visibility and task counts, avoiding a second duplicate step query.
        step_summary = _load_tasklist_step_summaries([(result.get("hw_id"), manager_code)]).get(str(result.get("hw_id") or ""), {})
        result["task_modules_configured"] = bool(step_summary.get("configured"))
        result["selected_modules"] = step_summary.get("selected_modules") if step_summary else None
        result["task_modules"] = step_summary.get("selected_modules") if step_summary else None
        result["selected_task_count"] = step_summary.get("task_count") if step_summary else None
        result["task_count"] = step_summary.get("task_count") if step_summary else None
        result["task_done_count"] = step_summary.get("task_done_count") if step_summary else None
        result["task_pending_count"] = step_summary.get("task_pending_count") if step_summary else None
        result["task_checker_done_count"] = step_summary.get("task_checker_done_count") if step_summary else None
        result["task_routes"] = step_summary.get("task_routes") or [] if step_summary else []

        # Tra cứu xem trong CSDL bản vẽ nội bộ (SQLite/MySQL) đã có project nào lưu theo job_number chưa
        local_job = None
        job_number = result.get("job_number")
        if job_number:
            try:
                local_conn = get_db_connection()
                local_cursor = local_conn.cursor()
                local_cursor.execute(
                    "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE LOWER(TRIM(project_name)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1",
                    (job_number.strip(),)
                )
                local_row = local_cursor.fetchone()
                if local_row:
                    local_job = {
                        "id": local_row["id"],
                        "project_name": local_row["project_name"],
                        "room_count": local_row["room_count"],
                        "total_area": local_row["total_area"],
                        "data": local_row["data"]
                    }
                local_conn.close()
            except Exception as ex:
                logger.warning(f"[open-by-ems] Không thể kiểm tra local jobs: {ex}")

        result["local_job"] = local_job

        return {
            "status": "success",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[open-by-ems] Lỗi truy vấn MSSQL: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.post("/jobs/export-procurement")
@router.post("/api/jobs/export-procurement")
async def export_procurement(payload: dict, x_username: Optional[str] = Header(None, alias="X-Username")):
    """
    Chuyển tiếp gói dữ liệu Job từ EzeFloor sang dịch vụ Procurement.
    Chỉ cho phép tài khoản Admin hoặc nhóm Hardware (AdminHW, LeaderHW, EmployeeHW) thực hiện.
    Tự động truy xuất và đính kèm toàn bộ 12 cột của Job từ CSDL SQLite (ezefloor.db):
    id, user_id, project_name, room_count, total_area, data (JSON CAD/BIM), thumbnail,
    is_trained, is_corrected, share_token, is_exported, created_at.
    """
    if x_username:
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT role FROM users WHERE username = ?", (x_username,))
            u_row = cur.fetchone()
            if u_row:
                u_role = (u_row["role"] or "").lower()
                is_hw_or_admin = u_role in ["admin", "administrator", "adminhw", "leaderhw", "employeehw"] or u_role.endswith("hw") or "hardware" in u_role
                if not is_hw_or_admin:
                    raise HTTPException(
                        status_code=403,
                        detail="Tài khoản của bạn không thuộc nhóm Hardware (HW Progress) để xuất dữ liệu Procurement."
                    )
        finally:
            if conn:
                conn.close()
    import httpx

    # 1. Truy xuất bản ghi đầy đủ 12 cột từ bảng jobs trong CSDL
    db_job_record = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        proj_name = payload.get("projectName") or payload.get("project_name") or payload.get("job_number") or payload.get("job_num")
        job_id = payload.get("jobId") or payload.get("id") or payload.get("ems_id")

        cursor.execute(
            """
            SELECT id, user_id, project_name, room_count, total_area, data, thumbnail, 
                   is_trained, is_corrected, share_token, is_exported, created_at 
            FROM jobs 
            WHERE project_name = ? OR id = ? 
            ORDER BY id DESC LIMIT 1
            """,
            (proj_name, job_id)
        )
        row = cursor.fetchone()
        if row:
            db_job_record = dict(row)
            # Cập nhật cờ is_exported = 1
            try:
                cursor.execute("UPDATE jobs SET is_exported = 1 WHERE id = ?", (row["id"],))
                conn.commit()
            except Exception:
                pass
        conn.close()
    except Exception as e:
        logger.warning(f"[export_procurement] Lỗi trích xuất bản ghi SQLite job: {e}")

    # 2. Đính kèm thông tin bản ghi DB vào payload gửi đi
    if db_job_record:
        payload["job_record"] = db_job_record
        payload["db_job"] = {
            "id": db_job_record.get("id"),
            "user_id": db_job_record.get("user_id"),
            "project_name": db_job_record.get("project_name"),
            "room_count": db_job_record.get("room_count"),
            "total_area": db_job_record.get("total_area"),
            "thumbnail": db_job_record.get("thumbnail"),
            "is_trained": db_job_record.get("is_trained"),
            "is_corrected": db_job_record.get("is_corrected"),
            "share_token": db_job_record.get("share_token"),
            "is_exported": 1,
            "created_at": db_job_record.get("created_at")
        }

    target_url = "http://14.241.197.188:7642/api/receive-job"
    token = payload.get("token")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(target_url, json=payload, headers=headers)
            if res.status_code in [200, 201, 204]:
                return {
                    "status": "success",
                    "remote_status": res.status_code,
                    "remote_data": res.text,
                    "job_record": db_job_record
                }
            else:
                return {
                    "status": "success",
                    "mode": "client_sso",
                    "remote_status": res.status_code,
                    "message": "Frontend Web App (Client-side SSO & deep-link active)",
                    "job_record": db_job_record
                }
    except Exception as e:
        logger.info(f"[Procurement] Chuyển tiếp qua giao thức Client-side SSO: {e}")
        return {
            "status": "success",
            "mode": "client_sso",
            "message": "Client-side SSO active",
            "job_record": db_job_record
        }

