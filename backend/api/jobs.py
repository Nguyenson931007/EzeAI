"""
backend/api/jobs.py
===================
Module xử lý quản lý dự án (Jobs) của EzeFloor.
Bao gồm các chức năng: Lưu dự án, Đọc danh sách dự án của người dùng, Đọc dữ liệu chi tiết,
Khôi phục, Đổi tên, Xóa dự án, Trích xuất & thu nhỏ ảnh thu nhỏ (Thumbnail Base64) để tối ưu dung lượng DB,
Xem lịch sử chỉnh sửa chéo, và Chia sẻ dự án công khai qua Token bảo mật.
"""

from fastapi import APIRouter, HTTPException, Depends, Response, Header
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
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if username and username != "undefined":
            cursor.execute(
                "SELECT COUNT(*) as total FROM jobs j JOIN users u ON j.user_id = u.id WHERE u.username = ?", 
                (username,)
            )
        else:
            cursor.execute("SELECT COUNT(*) as total FROM jobs")
            
        row = cursor.fetchone()
        count = int(row["total"]) if row else 0
        print(f"[debug] Tổng số lượng dự án: {count} (Người sở hữu={username})")
        return {"count": count}
    except Exception as e:
        print(f"[error] Lỗi khi đếm số dự án: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


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
        return [dict(row) for row in rows]
    except Exception as e:
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
        print(f"[get_all_jobs] Error fetching jobs: {e}")
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
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [emsflow].[dbo].[task_group_hw] tghw
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0
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
