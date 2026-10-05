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
from api.unit_scope import get_active_unit
from app.stored_procedures import execute_procedure
from app.procurement_task_sp import resolve_job_hw_id

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
    floor_level: Optional[str] = Field("GF", description="Floor level (GF, FF, SF...)")
    floorLevel: Optional[str] = Field(None, description="Alias floor level")


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
async def get_timber_posts_jobs(request: Request, office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách TimberPosts jobs từ MSSQL [ProcurementApp].[dbo].[Beams].
    Chỉ lấy các bản ghi ĐANG HOẠT ĐỘNG HIỆN TẠI: ISNULL(tp.IsOldData, 0) = 0.
    """
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        normalized_office = (office or "").strip().upper() or None
        execute_procedure(cursor, "dbo.usp_EzeFloor_TimberPosts_List", {"Unit": active_unit, "Office": normalized_office})
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
                    "floor_level": str(r.get("floor_level") or "GF").strip(),
                    "floorLevel": str(r.get("floor_level") or "GF").strip(),
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
async def save_timber_posts_jobs(request: Request, payload: SaveTimberPostsPayloadSchema):
    """
    Lưu dữ liệu TimberPosts cho danh sách Job.
    Áp dụng IsOldData versioning và Transaction.
    """
    active_unit = get_active_unit(request)
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()

        user_update = payload.user_update or "admin"

        total_saved_posts = 0

        for job in payload.jobs:
            raw_id = str(job.id_job_hw).strip()
            try:
                job_hw_id = resolve_job_hw_id(cursor, raw_id, api_file=__file__)
            except ValueError:
                job_hw_id = raw_id

            # 1. Chuyển các bản ghi cũ của Job này thành IsOldData = 1
            execute_procedure(cursor, "dbo.usp_EzeFloor_TimberPosts_Archive", {"JobHwId": job_hw_id, "Unit": active_unit, "UserUpdate": user_update})

            # 2. Thêm mới các post hiện tại (IsOldData = 0)
            for p in job.posts:
                try:
                    qty_val = _positive_int(p.qty, "Qty", 1)
                    gal_val = _positive_int(p.gal_post_supports, "Gal Post Supports", 0)
                    p_type = _clean_text(p.post_type)
                    p_height = _normalize_height(p.post_height)
                    p_size = _clean_text(p.post_size).replace(" ", "")
                    p_post = _clean_text(p.post)
                    p_floor_level = _clean_text(getattr(p, 'floor_level', None) or getattr(p, 'floorLevel', None) or 'GF') or 'GF'

                    if not p_type or not p_size or not p_post:
                        raise ValueError("Post Type, Post Size and Post are required")
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc))

                # Do not manufacture a generic Post description here.  The
                # exact selected value is what Procurement uses to match
                # beams-posts mappings (e.g. HWD 90x90 2.4m -> 0218185).
                p_gal = str(gal_val)

                execute_procedure(cursor, "dbo.usp_EzeFloor_TimberPosts_Insert", {"JobHwId": job_hw_id, "Unit": active_unit, "PostType": p_type, "PostHeight": p_height, "PostSize": p_size, "Post": p_post, "Qty": qty_val, "GalPostSupports": p_gal, "UserUpdate": user_update, "FloorLevel": p_floor_level})
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
