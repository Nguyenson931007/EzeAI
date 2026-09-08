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
# uses the common 13-step contract. Step 13 has no EzeFloor form yet, so it is
# returned in selected_steps but intentionally has no task_modules mapping.
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
    13: None,
}

def _is_cairns_customer(customer: str) -> bool:
    return "CAIRNS" in str(customer or "").strip().upper()

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
            count = int(row["total"]) if row and "total" in row and row["total"] is not None else 0
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
# TASK GROUPS HW (LOCAL CACHE TABLE READ - SUPER FAST)
# ══════════════════════════════════════════════════════

import threading
_is_syncing_hw = False
_last_hw_sync_time = 0

def sync_task_groups_hw_to_local_db(limit_val: Optional[int] = None):
    """
    Hàm chạy ngầm đồng bộ TOÀN BỘ danh sách Task Groups HW từ TaskList Web3 (MSSQL)
    về bảng cục bộ `task_group_hw_cache` (MySQL / SQLite).
    """
    global _is_syncing_hw, _last_hw_sync_time
    if _is_syncing_hw:
        return
    _is_syncing_hw = True

    try:
        import time
        from app.mssql_db import get_mssql_connection
        from app.database import DB_TYPE

        limit_desc = f"{limit_val} Task" if limit_val else "TOÀN BỘ Task"
        logger.info(f"[task-sync] Bắt đầu đồng bộ ngầm {limit_desc} HW từ MSSQL sang Local DB...")
        t0 = time.time()

        mconn = get_mssql_connection()
        mcursor = mconn.cursor(as_dict=True)

        top_clause = f"TOP {limit_val}" if limit_val and limit_val > 0 else ""

        sql = f"""
            SELECT {top_clause}
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,
                tghw.created_at,
                tghw.progress,
                tghw.is_done,
                lj.JobNumber AS job_number,
                lj.Client AS client,
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [emsflow].[dbo].[task_group_hw] tghw WITH (NOLOCK)
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj WITH (NOLOCK)
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj WITH (NOLOCK)
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0
            WHERE ISNULL(tghw.is_delete, 0) = 0 AND lj.JobNumber IS NOT NULL
            ORDER BY tghw.created_at DESC
        """

        mcursor.execute(sql)
        rows = mcursor.fetchall()
        mconn.close()

        if not rows:
            logger.warning("[task-sync] Không tìm thấy bản ghi Task HW từ MSSQL.")
            return

        lconn = get_db_connection()
        lcursor = lconn.cursor()

        if DB_TYPE == "mysql":
            insert_sql = """
                INSERT INTO task_group_hw_cache (
                    hw_id, id_job_ems, id_assign_ems, job_number, client, builder, ma_nv, progress, is_done, created_at, synced_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                    id_job_ems = VALUES(id_job_ems),
                    id_assign_ems = VALUES(id_assign_ems),
                    job_number = VALUES(job_number),
                    client = VALUES(client),
                    builder = VALUES(builder),
                    ma_nv = VALUES(ma_nv),
                    progress = VALUES(progress),
                    is_done = VALUES(is_done),
                    created_at = VALUES(created_at),
                    synced_at = NOW()
            """
            batch_data = []
            for r in rows:
                batch_data.append((
                    r['hw_id'], r['id_job_ems'], r['id_assign_ems'], r['job_number'],
                    r['client'], r['builder'], r['ma_nv'], float(r['progress'] or 0),
                    1 if r['is_done'] else 0, r['created_at']
                ))
            # Thực thi batch
            for item in batch_data:
                lcursor.execute(insert_sql, item)
        else:
            insert_sql = """
                INSERT OR REPLACE INTO task_group_hw_cache (
                    hw_id, id_job_ems, id_assign_ems, job_number, client, builder, ma_nv, progress, is_done, created_at, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """
            for r in rows:
                lcursor.execute(insert_sql, (
                    r['hw_id'], r['id_job_ems'], r['id_assign_ems'], r['job_number'],
                    r['client'], r['builder'], r['ma_nv'], float(r['progress'] or 0),
                    1 if r['is_done'] else 0, str(r['created_at'])
                ))

        lconn.commit()
        lconn.close()

        _last_hw_sync_time = time.time()
        logger.info(f"[task-sync] Đồng bộ thành công {len(rows)} Task HW vào Local DB trong {round((time.time()-t0)*1000)}ms")

    except Exception as sync_err:
        logger.error(f"[task-sync] Lỗi đồng bộ ngầm Task HW: {sync_err}")
    finally:
        _is_syncing_hw = False


@router.get("/jobs/tasklist-jobs")
async def get_tasklist_jobs(
    ma_nv: Optional[str] = Query(None, description="Lọc theo mã nhân viên e.g. EZE0098"),
    search: Optional[str] = Query(None, description="Tìm kiếm mã Job, Client, Builder"),
    limit: int = Query(2000, ge=1, le=20000, description="Số lượng job tối đa"),
    force_refresh: bool = Query(False, description="Đồng bộ lại từ MSSQL")
):
    """
    Lấy danh sách Task Groups HW trực tiếp từ CSDL Cục Bộ (MySQL / SQLite),
    kết hợp đối chiếu tức thì với bảng `jobs` để gắn tích xanh ✅ (< 5ms).
    """
    import time
    from app.database import DB_TYPE

    global _last_hw_sync_time

    # Nếu yêu cầu force_refresh, kích hoạt đồng bộ ngầm toàn bộ
    if force_refresh:
        threading.Thread(target=sync_task_groups_hw_to_local_db, daemon=True).start()

    conn = get_db_connection()
    cursor = conn.cursor()

    # Kiểm tra nếu bảng cache chưa có dữ liệu hoặc đã quá 10 phút chưa đồng bộ
    cursor.execute("SELECT COUNT(*) AS cnt FROM task_group_hw_cache")
    cnt_row = cursor.fetchone()
    cache_count = cnt_row["cnt"] if isinstance(cnt_row, dict) else (cnt_row[0] if cnt_row else 0)

    if cache_count == 0 or (time.time() - _last_hw_sync_time > 600):
        # Đồng bộ đồng bộ lần đầu nếu cache rỗng
        if cache_count == 0:
            sync_task_groups_hw_to_local_db()
        else:
            threading.Thread(target=sync_task_groups_hw_to_local_db, daemon=True).start()

    # Xây dựng câu truy vấn đọc siêu tốc từ Local DB
    where_clauses = []
    params = []

    clean_manv = ma_nv.strip() if isinstance(ma_nv, str) and ma_nv.strip() else None
    if clean_manv:
        where_clauses.append("t.ma_nv = ?")
        params.append(clean_manv)

    clean_search = search.strip() if isinstance(search, str) and search.strip() else None
    if clean_search:
        where_clauses.append("(t.job_number LIKE ? OR t.client LIKE ? OR t.builder LIKE ? OR t.ma_nv LIKE ?)")
        sp = f"%{clean_search}%"
        params.extend([sp, sp, sp, sp])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    limit_val = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 2000

    if DB_TYPE == "mysql":
        where_sql = where_sql.replace("?", "%s")

    sql = f"""
        SELECT 
            t.hw_id,
            t.id_job_ems,
            t.id_assign_ems,
            t.created_at,
            t.progress,
            t.is_done,
            t.job_number,
            t.client,
            t.builder,
            t.ma_nv,
            j.id AS local_job_id,
            j.project_name AS local_project_name,
            j.room_count,
            j.total_area
        FROM task_group_hw_cache t
        LEFT JOIN jobs j ON LOWER(TRIM(t.job_number)) = LOWER(TRIM(j.project_name))
        {where_sql}
        ORDER BY t.created_at DESC
        LIMIT {limit_val}
    """

    cursor.execute(sql, tuple(params) if params else None)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        item = dict(r) if isinstance(r, dict) or hasattr(r, "keys") else {
            "hw_id": r[0], "id_job_ems": r[1], "id_assign_ems": r[2], "created_at": str(r[3]),
            "progress": float(r[4] or 0), "is_done": bool(r[5]), "job_number": r[6], "client": r[7],
            "builder": r[8], "ma_nv": r[9], "local_job_id": r[10], "local_project_name": r[11],
            "room_count": r[12], "total_area": r[13]
        }

        has_local = bool(item.get("local_job_id"))
        results.append({
            "hw_id": item.get("hw_id"),
            "id_job_ems": item.get("id_job_ems"),
            "id_assign_ems": item.get("id_assign_ems"),
            "created_at": str(item.get("created_at") or ""),
            "progress": item.get("progress"),
            "is_done": item.get("is_done"),
            "job_number": item.get("job_number"),
            "client": item.get("client"),
            "builder": item.get("builder"),
            "ma_nv": item.get("ma_nv"),
            "has_local_job": has_local,
            "local_job": {
                "id": item.get("local_job_id"),
                "project_name": item.get("local_project_name") or item.get("job_number"),
                "room_count": item.get("room_count"),
                "total_area": item.get("total_area")
            } if has_local else None
        })

    return {
        "status": "success",
        "total": len(results),
        "completed_count": sum(1 for r in results if r["has_local_job"]),
        "data": results,
        "source": "local_database"
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
async def get_job_by_ems_id(ems_id: str, username: str = Depends(validate_session)):
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
            SELECT
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,
                lj.JobNumber AS job_number,
                lj.Client AS client,
                UPPER(LTRIM(RTRIM(COALESCE(NULLIF(lc.ShortName, ''), lj.Client)))) AS customer_short_name,
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [emsflow].[dbo].[task_group_hw] tghw
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] lc
                ON lc.ClientName = lj.Client
                AND ISNULL(lc.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0
            WHERE
                tghw.id_job_ems = %s
                AND ISNULL(tghw.is_delete, 0) = 0
        """

        cursor.execute(sql, (ems_id,))
        row = cursor.fetchone()

        if not row:
            logger.warning(f"[open-by-ems] Không tìm thấy HW Job với id_job_ems={ems_id}")
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

        if manager_code == "EZE0098" and not _is_cairns_customer(customer):
            try:
                cursor.execute(
                    """
                    SELECT step_number, is_visible
                    FROM [emsflow].[dbo].[task_group_hw_steps]
                    WHERE task_group_hw_id = %s
                    ORDER BY step_number ASC
                    """,
                    (result.get("hw_id"),)
                )
                step_rows = cursor.fetchall() or []

                selected_steps = [
                    int(r.get("step_number"))
                    for r in step_rows
                    if r.get("is_visible")
                    and int(r.get("step_number") or 0) in KATHERINE_STANDARD_STEPS
                ]
                task_modules = []
                for step_number in selected_steps:
                    module_id = KATHERINE_STEP_TO_MODULE.get(step_number)
                    if module_id and module_id not in task_modules:
                        task_modules.append(module_id)

                # Query succeeded => [] is authoritative and must not trigger FE fallback.
                result["selected_steps"] = selected_steps
                result["selected_task_names"] = [KATHERINE_STANDARD_STEPS[n] for n in selected_steps]
                result["task_modules"] = task_modules
                result["unmapped_steps"] = [
                    n for n in selected_steps if KATHERINE_STEP_TO_MODULE.get(n) is None
                ]
            except Exception as step_err:
                logger.error(f"[open-by-ems] Lỗi truy vấn task_group_hw_steps: {step_err}")
                result["selected_steps"] = None
                result["selected_task_names"] = None
                result["task_modules"] = None
                result["unmapped_steps"] = None
        else:
            # Cairns and other managers keep existing behavior.
            result["selected_steps"] = None
            result["selected_task_names"] = None
            result["task_modules"] = None
            result["unmapped_steps"] = None

        # Tra cứu xem trong CSDL bản vẽ nội bộ (SQLite/MySQL) đã có project nào lưu theo job_number chưa
        local_job = None
        job_number = result.get("job_number")
        if job_number:
            try:
                local_conn = get_db_connection()
                local_cursor = local_conn.cursor()
                local_cursor.execute(
                    "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE project_name = ? ORDER BY id DESC LIMIT 1",
                    (job_number,)
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

