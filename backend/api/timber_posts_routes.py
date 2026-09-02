"""
api/timber_posts_routes.py – TimberPosts API Router
=====================================================
Cung cấp REST endpoint để truy vấn và lưu thông tin cọc gỗ (Timber and Post) vào [ProcurementApp].[dbo].[Beams]

QUẢN LÝ LỊCH SỬ & TRANSACTION (IsOldData Versioning):
1. Không UPDATE trực tiếp dữ liệu hiện tại làm mất lịch sử.
2. Với mỗi Job được Save:
   - Chuyển toàn bộ record hiện tại (IsOldData = 0) thành lịch sử (IsOldData = 1, UserUpdate, DatetimeUpdate = GETDATE()).
   - Thêm mới các record hiện tại (IsOldData = 0) với ID sinh mới bằng NEWID().
3. Toàn bộ thao tác Save được thực hiện trong DATABASE TRANSACTION để đảm bảo an toàn tuyệt đối.
"""

import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.timber_posts")

router = APIRouter(prefix="/api/timber-posts", tags=["TimberPosts-router"])


# ══════════════════════════════════════════════════════
# PYDANTIC SCHEMAS CHO VALIDATION
# ══════════════════════════════════════════════════════

class TimberPostItemSchema(BaseModel):
    # These are the raw manual Beam inputs.  Keep them authoritative so
    # Procurement can reproduce the same result when "Add data AI" is used.
    post_type: str = Field(..., min_length=1, description="Post Type (e.g. HWD, HWD F14)")
    post_height: Union[str, float, int] = Field(..., description="Post Height (e.g. 2700, 2700mm)")
    post_size: str = Field(..., min_length=1, description="Post Size (e.g. 90x90, 100x100)")
    post: str = Field(..., min_length=1, description="Exact Post / Product selection from the form")
    qty: Union[int, str] = Field(1, description="Quantity")
    gal_post_supports: Union[str, int] = Field("0", description="Gal Post Supports")


class TimberPostJobSaveSchema(BaseModel):
    id_job_hw: Any = Field(..., description="ID / Mã HW Job (tghw.id hoặc job_number)")
    posts: List[TimberPostItemSchema] = Field(default_factory=list, description="Danh sách các post")


class SaveTimberPostsPayloadSchema(BaseModel):
    user_update: str = Field(..., description="Tên / mã người dùng thực hiện thao tác lưu")
    jobs: List[TimberPostJobSaveSchema] = Field(..., description="Danh sách các Job cần lưu")


# ══════════════════════════════════════════════════════
# 1. TRUY VẤN CÁC JOB TIMBER POSTS HIỆN TẠI (GET /api/timber-posts/jobs)
# ══════════════════════════════════════════════════════

@router.get("/jobs")
async def get_timber_posts_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách TimberPosts jobs từ MSSQL [ProcurementApp].[dbo].[Beams].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(tp.IsOldData, 0) = 0.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                tp.ID AS post_id,
                tghw.id AS IdJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                tp.PostType AS post_type,
                tp.PostHeight AS post_height,
                tp.PostSize AS post_size,
                tp.Post AS post,
                tp.Qty AS qty,
                tp.GalPostSupports AS gal_post_supports,
                tp.UserUpdate AS user_update,
                tp.DatetimeUpdate AS datetime_update,
                tp.IsOldData AS is_old_data,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [ProcurementApp].[dbo].[Beams] tp
                ON tghw.id = tp.IdJob_HW
               AND ISNULL(tp.IsOldData, 0) = 0

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            WHERE ISNULL(tghw.is_delete, 0) = 0
            ORDER BY tghw.created_at DESC, tp.DatetimeUpdate DESC
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        # Nhóm theo Job
        grouped = defaultdict(lambda: {
            "hw_id": None,
            "IDJob_HW": None,
            "job_number": None,
            "posts": []
        })

        for r in rows:
            hw_id = r.get("IdJob_HW") or r.get("hw_id")
            if not hw_id:
                continue

            j = grouped[hw_id]
            j["hw_id"] = hw_id
            j["IDJob_HW"] = hw_id
            j["job_number"] = r.get("job_number")

            if r.get("post_id"):
                j["posts"].append({
                    "id": str(r.get("post_id")),
                    "post_type": r.get("post_type"),
                    "post_height": r.get("post_height"),
                    "post_size": r.get("post_size"),
                    "post": r.get("post"),
                    "qty": r.get("qty") or 1,
                    "gal_post_supports": r.get("gal_post_supports") or "0",
                    "user_update": r.get("user_update"),
                    "datetime_update": r.get("datetime_update").isoformat() if r.get("datetime_update") else None
                })

        return {
            "success": True,
            "count": len(grouped),
            "data": list(grouped.values())
        }

    except Exception as e:
        logger.exception(f"Lỗi khi truy vấn TimberPosts: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi server khi lấy dữ liệu TimberPosts: {str(e)}")
    finally:
        if conn:
            conn.close()


def _clean_text(value: Any) -> str:
    return " ".join(str(value if value is not None else "").strip().split())


def _normalize_height(value: Any) -> str:
    raw = _clean_text(value)
    if not raw:
        raise ValueError("Post Height is required")
    match = __import__("re").search(r"[-+]?\d*\.?\d+", raw)
    if not match:
        raise ValueError(f"Invalid Post Height: {raw}")
    number = float(match.group(0))
    if number <= 0:
        raise ValueError("Post Height must be greater than 0")
    clean_number = str(int(number)) if number.is_integer() else str(number)
    return f"{clean_number} mm"


def _positive_int(value: Any, field_name: str, minimum: int) -> int:
    try:
        result = int(str(value).strip())
    except Exception as exc:
        raise ValueError(f"{field_name} must be an integer") from exc
    if result < minimum:
        raise ValueError(f"{field_name} must be >= {minimum}")
    return result


# ══════════════════════════════════════════════════════
# 2. LƯU TIMBER POSTS CHO JOB (POST /api/timber-posts/jobs/save)
# ══════════════════════════════════════════════════════

@router.post("/jobs/save")
async def save_timber_posts_jobs(payload: SaveTimberPostsPayloadSchema):
    """
    Lưu dữ liệu TimberPosts cho danh sách Job.
    Áp dụng IsOldData versioning và Transaction.
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = payload.user_update or "admin"

        sql_archive_old = """
            UPDATE [ProcurementApp].[dbo].[Beams]
            SET IsOldData = 1,
                UserUpdate = %s,
                DatetimeUpdate = GETDATE()
            WHERE IdJob_HW = %s
              AND ISNULL(IsOldData, 0) = 0;
        """

        sql_insert_new = """
            INSERT INTO [ProcurementApp].[dbo].[Beams]
            (
                ID,
                PostType,
                PostHeight,
                PostSize,
                Post,
                Qty,
                GalPostSupports,
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
                %s,
                GETDATE(),
                0
            );
        """

        total_saved_posts = 0

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            job_hw_id = raw_id

            # Ánh xạ input_job_id sang chính xác tghw.id trong task_group_hw
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

            # 2. Thêm mới các post hiện tại (IsOldData = 0)
            for p in job.posts:
                try:
                    qty_val = _positive_int(p.qty, "Qty", 1)
                    gal_val = _positive_int(p.gal_post_supports, "Gal Post Supports", 0)
                    p_type = _clean_text(p.post_type)
                    p_height = _normalize_height(p.post_height)
                    p_size = _clean_text(p.post_size).replace(" ", "")
                    p_post = _clean_text(p.post)

                    if not p_type or not p_size or not p_post:
                        raise ValueError("Post Type, Post Size and Post are required")
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc))

                # Do not manufacture a generic Post description here.  The
                # exact selected value is what Procurement uses to match
                # beams-posts mappings (e.g. HWD 90x90 2.4m -> 0218185).
                p_gal = str(gal_val)

                cursor.execute(
                    sql_insert_new,
                    (
                        p_type,
                        p_height,
                        p_size,
                        p_post,
                        qty_val,
                        p_gal,
                        job_hw_id,
                        user_update
                    )
                )
                total_saved_posts += 1

        conn.commit()
        return {
            "success": True,
            "message": f"Đã lưu thành công {total_saved_posts} timber post(s) vào ProcurementApp.",
            "total_saved": total_saved_posts
        }

    except Exception as e:
        if conn:
            conn.rollback()
        logger.exception(f"Lỗi khi lưu TimberPosts: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi server khi lưu TimberPosts: {str(e)}")
    finally:
        if conn:
            conn.close()
